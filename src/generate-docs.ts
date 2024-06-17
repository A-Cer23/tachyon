import { TObject, TSchema, TUnion } from "@sinclair/typebox";
import fs from "fs";
import { objectKeys, titleCase } from "jaz-ts-utils";
// @ts-ignore
import { JSONSchemaFaker } from "json-schema-faker";
import { compile } from "json-schema-to-typescript";

import { CommandConfig, TachyonConfig } from "@/generate-json-schemas";
import { stringifyJsonSchema } from "@/json-schema-format";

JSONSchemaFaker.option("useExamplesValue", true);
JSONSchemaFaker.option("useDefaultValue", true);
let randomSeed = 0;

const autoGeneratedPrefix = `<!-- THIS FILE IS AUTOMATICALLY GENERATED, PLEASE DO NOT EDIT IT MANUALLY -->\n\n`;

export async function generateDocs(tachyonConfig: TachyonConfig) {
    const tachyonSchema: Record<string, Record<string, CommandConfig>> = {};

    objectKeys(tachyonConfig.schemaMeta.serviceIds).forEach((serviceId) => {
        for (const endpointId of tachyonConfig.schemaMeta.serviceIds[serviceId]) {
            if (!tachyonSchema[serviceId]) {
                tachyonSchema[serviceId] = {};
            }
            tachyonSchema[serviceId][endpointId] =
                tachyonConfig.commandConfigs[`${serviceId}/${endpointId}`];
        }
    });

    let schemaContents = "";
    for (const serviceId in tachyonSchema) {
        schemaContents += `  - [${serviceId}](docs/schema/${serviceId}.md)\n`;
    }

    let mainReadme = await fs.promises.readFile("README.md", { encoding: "utf-8" });
    const regex =
        /(?<=COMMAND_SCHEMA_PLACEHOLDER_START.*$\n)[\s|\S]*(?=^.*COMMAND_SCHEMA_PLACEHOLDER_END.*)/ms;
    if (!mainReadme.match(regex)) {
        throw new Error("Could not find COMMAND_SCHEMA_PLACEHOLDER comment in main README.md");
    }
    mainReadme = mainReadme.replace(regex, schemaContents);
    await fs.promises.writeFile("README.md", mainReadme);

    await fs.promises.mkdir("docs/schema", { recursive: true });
    for (const serviceId in tachyonSchema) {
        const serviceSchema = tachyonSchema[serviceId] as Record<string, CommandConfig>;

        const orderedCommandIds = Object.keys(serviceSchema).sort((a, b) => {
            const orderA = serviceSchema[a]?.config.order ?? Infinity;
            const orderB = serviceSchema[b]?.config.order ?? Infinity;
            return orderA - orderB;
        });

        const orderedCommandConfigs = {} as Record<string, CommandConfig>;
        for (const id of orderedCommandIds) {
            orderedCommandConfigs[id] = tachyonConfig.commandConfigs[`${serviceId}/${id}`];
        }

        const markdown = await generateServiceMarkdown(
            serviceId,
            orderedCommandConfigs,
            tachyonConfig.compiledSchema
        );

        await fs.promises.writeFile(`docs/schema/${serviceId.toString()}.md`, markdown);
    }
}

export async function generateServiceMarkdown(
    serviceId: string,
    endpointConfigs: Record<string, CommandConfig>,
    compiledSchema: TUnion<TSchema[]>
): Promise<string> {
    let markdown = autoGeneratedPrefix;

    markdown += `# ${titleCase(serviceId)}\n\n`;

    if (fs.existsSync(`src/schema/${serviceId}/README.md`)) {
        const serviceReadme = await fs.promises.readFile(`src/schema/${serviceId}/README.md`, {
            encoding: "utf8",
        });

        markdown += `${serviceReadme}\n---\n`;
    }

    for (const endpointId in endpointConfigs) {
        markdown += `- [${endpointId}](#${endpointId.toLowerCase()})\n`;
    }

    for (const endpointId in endpointConfigs) {
        markdown += await generateEndpointMarkdown(
            serviceId,
            endpointId,
            endpointConfigs[endpointId],
            compiledSchema
        );
    }

    return markdown;
}

export async function generateEndpointMarkdown(
    serviceId: string,
    endpointId: string,
    commandConfig: CommandConfig,
    compiledSchema: TSchema
): Promise<string> {
    let markdown = `---\n\n## ${titleCase(endpointId)}\n\n`;

    if (commandConfig.config.description) {
        markdown += `${commandConfig.config.description}\n\n`;
    }

    markdown += `- Endpoint Type: `;

    if ("request" in commandConfig) {
        markdown += `**Request** -> **Response**\n`;
    } else {
        markdown += `**Event**\n`;
    }

    markdown += `- Source: **${titleCase(commandConfig.config.source)}**\n`;
    markdown += `- Target: **${titleCase(commandConfig.config.target)}**\n`;

    if (commandConfig.config.scopes.length) {
        markdown += `- Required Scopes: \`${commandConfig.config.scopes}\`\n\n`;
    }

    if (commandConfig.type === "requestResponse") {
        markdown += await generateCommandMarkdown(
            serviceId,
            endpointId,
            commandConfig.schema.request,
            compiledSchema.definitions,
            "request"
        );
        markdown += await generateCommandMarkdown(
            serviceId,
            endpointId,
            commandConfig.schema.response,
            compiledSchema.definitions,
            "response"
        );
    } else {
        markdown += await generateCommandMarkdown(
            serviceId,
            endpointId,
            commandConfig.schema.event,
            compiledSchema.definitions,
            "event"
        );
    }

    return markdown;
}

export async function generateCommandMarkdown(
    serviceId: string,
    endpointId: string,
    schema: TSchema,
    definitions: TSchema,
    commandType: string
): Promise<string> {
    let markdown = `### ${titleCase(commandType)}\n\n`;

    markdown += `<details>
<summary>JSONSchema</summary>\n
\`\`\`json
${await stringifyJsonSchema(schema)}
\`\`\`\n</details>\n\n`;

    const failedReasons: string[] = [];

    if (commandType === "response") {
        failedReasons.push(
            ...schema.anyOf
                .filter((res: TObject) => res.properties.status.const === "failed")
                .map((res: TObject) => res.properties.reason.enum)
                .flat()
        );
        schema = schema.anyOf.find((res: TObject) => res.properties.status.const === "success");
    }

    schema.definitions = definitions;

    schema = JSON.parse(
        JSON.stringify(schema, null, 4).replaceAll(
            /(?:\.\.\/)+definitions\/(.*)?\.json/g,
            "#/definitions/$1"
        )
    );

    JSONSchemaFaker.option("random", () => randomSeed);
    randomSeed += 0.01;

    const dummyData = await JSONSchemaFaker.resolve(schema);
    markdown += `<details>
<summary>Example</summary>\n
\`\`\`json
${JSON.stringify(dummyData, null, 4)}
\`\`\`\n</details>\n\n`;

    try {
        let typings = await compile(
            schema,
            `${titleCase(serviceId)}${titleCase(endpointId)}${titleCase(commandType)}`,
            {
                additionalProperties: false,
                bannerComment: ``,
                style: {
                    bracketSpacing: true,
                    tabWidth: 4,
                    semi: true,
                },
            }
        );
        typings = typings.replace(/\s*\/\*[\s\S]*?\*\/|(?<=[^:])\/\/.*|^\/\/.*/g, ""); // remove comments

        markdown += `#### TypeScript Definition
\`\`\`ts
${typings.trim()}
\`\`\`
`;

        if (failedReasons.length) {
            markdown += `Possible Failed Reasons: ${failedReasons.map((r) => `\`${r}\``).join(", ")}\n\n`;
        }
    } catch (err) {
        console.log(schema);
        throw err;
    }

    return markdown;
}
