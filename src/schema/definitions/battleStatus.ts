import { Type } from "@sinclair/typebox";

import { player } from "@/schema/definitions/player";
import { Nullable } from "@/typebox-utils";

export const battleStatus = Nullable(
    Type.Intersect([
        Type.Object({
            battleId: Type.String(),
        }),
        Type.Intersect([
            Type.Object({
                isSpectator: Type.Boolean(),
            }),
            Type.Ref(player),
        ]),
    ]),
    { $id: "battleStatus" }
);
