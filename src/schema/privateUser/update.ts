import { Type } from "@sinclair/typebox";

import { defineEndpoint } from "@/generator-helpers.js";
import { privateUser } from "@/schema/definitions/privateUser";

export default defineEndpoint({
    source: "server",
    target: "user",
    description:
        "Sent by the server to inform the client when its own user get updated in some way. The user object is partial, meaning only the elements present have changed, and anything missing is assumed to be unchanged. This event should precede the [add](#add) event which contains the full, initial state of the user.",
    event: {
        data: Type.Object({
            user: Type.Partial(privateUser),
        }),
    },
});
