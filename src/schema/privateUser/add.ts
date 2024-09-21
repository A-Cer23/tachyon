import { Type } from "@sinclair/typebox";

import { defineEndpoint } from "@/generator-helpers.js";
import { privateUser } from "@/schema/definitions/privateUser";

export default defineEndpoint({
    source: "server",
    target: "user",
    description:
        "Contains the full state of client's own user. This event should always precede [update](#update) events which contain partial updates of how the user has changed.",
    event: {
        data: Type.Object({
            user: Type.Ref(privateUser),
        }),
    },
});
