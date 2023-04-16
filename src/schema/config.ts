import { Type } from "@sinclair/typebox";

import { Service } from "../helpers";

export const configEndpoints = {
    /*
  Game configs are a key-value store with no enforced structure. You can add keys as you wish, you can update keys to any type. Keys must be strings though values can be strings, integers, booleans, lists or even maps.

  Note this is not designed to be a large data store, please don't store large blobs of data in it.
  */
    list_game_types: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },
    set_game: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },
    get_game: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },

    /*
  User configs are tied to the Teiserver structured configs that can be accessed on the site itself. These are constrained by data type (though will where possible convert inputs to that data type) and come with defaults.
  */
    list_user_types: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },
    set_user: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },
    get_user: {
        request: Type.Object({}, { additionalProperties: true }),
        response: Type.Object({}, { additionalProperties: true }),
    },
} as const satisfies Service;