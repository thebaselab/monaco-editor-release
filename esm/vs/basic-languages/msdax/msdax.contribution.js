/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.34.0(09be576361e93eda11c5c0f766a34aab06a1033d)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/

// src/basic-languages/msdax/msdax.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "msdax",
  extensions: [".dax", ".msdax"],
  aliases: ["DAX", "MSDAX"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/msdax/msdax"], resolve, reject);
      });
    } else {
      return import("./msdax.js");
    }
  }
});
