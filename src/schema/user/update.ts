import { Type } from "@sinclair/typebox";

import { defineEndpoint } from "@/generator-helpers.js";
import { privateUser } from "@/schema/definitions/privateUser";
import { user } from "@/schema/definitions/user";

export default defineEndpoint({
    source: "server",
    target: "user",
    description:
        "Sent by the server to inform the client when subscribed users get updated in some way. The root object of each array element in `users` are partial, meaning only the elements present have changed, and anything missing is assumed to be unchanged. This event should precede the [add](#add) event which contains the full, initial state of users.",
    event: {
        data: Type.Union([
            Type.Object({
                self: Type.Partial(privateUser),
            }),
            Type.Object({
                users: Type.Array(Type.Partial(user)),
            }),
        ]),
    },
});
