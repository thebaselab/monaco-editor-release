/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.34.0(09be576361e93eda11c5c0f766a34aab06a1033d)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/

// src/basic-languages/redis/redis.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "redis",
  extensions: [".redis"],
  aliases: ["redis"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/redis/redis"], resolve, reject);
      });
    } else {
      return import("./redis.js");
    }
  }
});
