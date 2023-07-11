import { TObject, TProperties, TUnion, Type } from "@sinclair/typebox";
import fs from "fs";
import { objectKeys, titleCase } from "jaz-ts-utils";
import jsf from "json-schema-faker";
import { compile } from "json-schema-to-typescript";
import path from "path";

import { EndpointConfig, FailedResponseSchema, SuccessResponseSchema } from "@/helpers";

(async () => {
    const fullSchemaProps: Record<string, Record<string, TProperties>> = {};
    const tachyonSchema: Record<string, Record<string, EndpointConfig>> = {};

    const serviceDirs = path.join(__dirname, "schema");
    const serviceHandlerDirs = await fs.promises.readdir(serviceDirs);
    for (const serviceId of serviceHandlerDirs) {
        if (serviceId.includes(".")) {
            continue;
        }
        const endpointDir = path.join(serviceDirs, serviceId);
        const endpointSchemaModules = await fs.promises.readdir(endpointDir, {
            withFileTypes: true,
        });

        const serviceSchema: Record<string, EndpointConfig> = {};
        fullSchemaProps[serviceId] = {};

        for (const endpointSchemaPath of endpointSchemaModules) {
            if (endpointSchemaPath.name.endsWith(".md")) {
                continue;
            }
            const endpointId = path.parse(endpointSchemaPath.name).name;
            const endpoint = await import(path.join(endpointDir, endpointSchemaPath.name));
            const endpointSchema = endpoint.default as EndpointConfig;
            fullSchemaProps[serviceId][endpointId] = {};
            await fs.promises.mkdir(path.join("dist", serviceId, endpointId), {
                recursive: true,
            });

            if ("request" in endpointSchema) {
                const props: TProperties = {
                    command: Type.Literal(`${serviceId}/${endpointId}/request`),
                };
                if (endpointSchema.request.data) {
                    props.data = endpointSchema.request.data;
                }
                const schema = Type.Object(props, {
                    $id: `${serviceId}/${endpointId}/request`,
                });
                const schemaStr = JSON.stringify(schema, null, 4);
                await fs.promises.writeFile(
                    `dist/${serviceId}/${endpointId}/request.json`,
                    schemaStr
                );
                fullSchemaProps[serviceId][endpointId].request = schema;
            }
            if ("response" in endpointSchema && endpointSchema.response.length) {
                const successResponses = endpointSchema.response
                    .filter((res): res is SuccessResponseSchema => res.status === "success")
                    .map((res) => {
                        const props: TProperties = {
                            command: Type.Literal(`${serviceId}/${endpointId}/response`),
                            status: Type.Literal(res.status),
                        };
                        if (res.data) {
                            props.data = res.data;
                        }
                        return Type.Object(props);
                    });
                const schema = Type.Union(
                    [
                        ...successResponses,
                        Type.Object({
                            command: Type.Literal(`${serviceId}/${endpointId}/response`),
                            status: Type.Literal("failed"),
                            reason: Type.Union(
                                endpointSchema.response
                                    .filter(
                                        (res): res is FailedResponseSchema =>
                                            res.status === "failed"
                                    )
                                    .map((res) => {
                                        return Type.Literal(res.reason);
                                    })
                            ),
                        }),
                    ],
                    {
                        $id: `${serviceId}/${endpointId}/response`,
                    }
                );
                const schemaStr = JSON.stringify(schema, null, 4);
                await fs.promises.writeFile(
                    `dist/${serviceId}/${endpointId}/response.json`,
                    schemaStr
                );
                fullSchemaProps[serviceId][endpointId].response = schema;
            }
            serviceSchema[endpointId] = endpointSchema;
        }
        tachyonSchema[serviceId] = serviceSchema;
    }

    let fullSchema: any = {};
    for (const serviceId in fullSchemaProps) {
        fullSchema[serviceId] = {};
        const serviceSchema = fullSchemaProps[serviceId];
        for (const endpointId in serviceSchema) {
            const endpointSchema = serviceSchema[endpointId];
            fullSchema[serviceId][endpointId] = Type.Object(endpointSchema, {
                description: tachyonSchema[serviceId][endpointId].description,
            });
        }
        fullSchema[serviceId] = Type.Object(fullSchema[serviceId]);
    }
    fullSchema = Type.Object(fullSchema);

    for (const serviceId in tachyonSchema) {
        const serviceSchema = tachyonSchema[serviceId] as Record<string, EndpointConfig>;

        const orderedEndpointIds = Object.keys(serviceSchema).sort((a, b) => {
            const orderA = serviceSchema[a]?.order ?? Infinity;
            const orderB = serviceSchema[b]?.order ?? Infinity;

            return orderA - orderB;
        });

        const orderedEndpoints = {} as Record<string, TObject>;
        for (const id of orderedEndpointIds) {
            orderedEndpoints[id] = fullSchema.properties[serviceId].properties[id];
        }

        const markdown = await generateServiceMarkdown(orderedEndpoints, serviceId);

        await fs.promises.mkdir(`docs`, { recursive: true });
        await fs.promises.writeFile(`docs/${serviceId.toString()}.md`, markdown);
    }

    let typings = await compile(fullSchema, "Tachyon", {
        additionalProperties: false,
        bannerComment: `/**
        * This file was automatically generated, do not edit it manually.
        * Instead modify the .ts files in src/schema and do npm run build
        */`,
        style: {
            bracketSpacing: true,
            tabWidth: 4,
            semi: true,
        },
    });
    const types = await import("./schema/types");
    for (const key of objectKeys(types)) {
        const thing = types[key];
        const fullType = Type.Strict(thing as any);
        const type = await compile(fullType, key, {
            bannerComment: "",
            additionalProperties: false,
            style: {
                bracketSpacing: true,
                tabWidth: 4,
                semi: true,
            },
        });
        typings += type + "\n";
    }

    typings += `
export type ServiceId = keyof Tachyon;

export type EndpointId = keyof Tachyon[ServiceId];

export type RequestEndpointId<S extends ServiceId> = keyof {
    [key in keyof Tachyon[S] as Tachyon[S][key] extends { request: any } ? key : never]: Tachyon[S][key];
};

export type ResponseEndpointId<S extends ServiceId> = keyof {
    [key in keyof Tachyon[S] as Tachyon[S][key] extends { response: any } ? key : never]: Tachyon[S][key];
};

export type RequestType<S extends ServiceId, E extends RequestEndpointId<S>> = Tachyon[S][E] extends { request: infer Req } ? Req : object;

export type ResponseType<S extends ServiceId, E extends ResponseEndpointId<S>> = Tachyon[S][E] extends { response: infer Res } ? Res : object;

export type RequestData<S extends ServiceId, E extends RequestEndpointId<S>> = Tachyon[S][E] extends { request: { data: infer Data } } ? Data : never;

export type ResponseData<S extends ServiceId, E extends ResponseEndpointId<S>> = Tachyon[S][E] extends { response: { data: infer Data } } ? Data : never;

export type RemoveField<T, K extends string> = T extends { [P in K]: any } ? Omit<T, K> : never;

export type GetCommands<S extends ServiceId, E extends keyof Tachyon[S]> = Tachyon[S][E];
`;
    await fs.promises.writeFile(`dist/index.d.ts`, typings);
})();

jsf.option("useExamplesValue", true);
jsf.option("random", () => 0.1234);

async function generateServiceMarkdown<T extends Record<string, TObject>>(
    endpoints: T,
    serviceId: string
): Promise<string> {
    let markdown = `# ${titleCase(serviceId)}\n\n`;

    if (fs.existsSync(`src/schema/${serviceId}/README.md`)) {
        const serviceReadme = await fs.promises.readFile(`src/schema/${serviceId}/README.md`, {
            encoding: "utf8",
        });

        markdown += `${serviceReadme}\n---\n`;
    }

    for (const endpointId in endpoints) {
        markdown += `- [${endpointId}](#${endpointId.toLowerCase()})\n`;
    }

    for (const endpointId in endpoints) {
        const endpointConfig = endpoints[endpointId];
        markdown += `---\n\n## ${endpointId.toString()}\n\n`;
        if (endpointConfig.description) {
            markdown += `${endpointConfig.description}\n\n`;
        }
        markdown += await generateEndpointMarkdown(endpointConfig, serviceId, endpointId);
    }

    return markdown;
}

async function generateEndpointMarkdown<T extends TObject>(
    schema: T,
    serviceId: string,
    endpointId: string
): Promise<string> {
    let serviceMarkdown = "";

    if ("request" in schema.properties) {
        serviceMarkdown += `### request\n\n`;
        serviceMarkdown += await generateCommandMarkdown(
            schema.properties.request as TObject,
            serviceId,
            endpointId,
            "request"
        );
    }

    if ("response" in schema.properties) {
        serviceMarkdown += `### response\n\n`;
        serviceMarkdown += await generateCommandMarkdown(
            schema.properties.response as TUnion,
            serviceId,
            endpointId,
            "response"
        );
    }

    return serviceMarkdown;
}

async function generateCommandMarkdown<
    C extends "request" | "response",
    T extends C extends "request" ? TObject : TUnion
>(schema: T, serviceId: string, endpointId: string, commandType: C): Promise<string> {
    let commandMarkdown = "";

    commandMarkdown += `<details>
<summary>JSONSchema</summary>\n
\`\`\`json
${JSON.stringify(schema, null, 4)}
\`\`\`\n
</details>\n\n`;

    let typings = await compile(schema, "A", {
        additionalProperties: false,
        bannerComment: ``,
        style: {
            bracketSpacing: true,
            tabWidth: 4,
            semi: true,
        },
    });

    typings = typings.replace(/\s*\/\*[\s\S]*?\*\/|(?<=[^:])\/\/.*|^\/\/.*/g, ""); // remove comments

    commandMarkdown += `#### TypeScript Definition
\`\`\`ts
${typings}
\`\`\`
`;

    if (commandType === "response") {
        schema = schema.anyOf.find((res: TObject) => res.properties.status.const === "success");
    }

    const dummyData = await jsf.resolve(schema);

    commandMarkdown += `#### Example
\`\`\`json
${JSON.stringify(dummyData, null, 4)}
\`\`\`
`;

    return commandMarkdown;
}
