import { Type } from "@sinclair/typebox";

import { player } from "@/schema/definitions/player";
import { spectator } from "@/schema/definitions/spectator";
import { Nullable } from "@/typebox-utils";

export const battleStatus = Nullable(
    Type.Intersect([
        Type.Object({
            battleId: Type.String(),
        }),
        Type.Union([
            Type.Intersect([
                Type.Object({
                    isSpectator: Type.Literal(true),
                }),
                Type.Ref(spectator),
            ]),
            Type.Intersect([
                Type.Object({
                    isSpectator: Type.Literal(false),
                }),
                Type.Ref(player),
            ]),
        ]),
    ]),
    { $id: "battleStatus" }
);
