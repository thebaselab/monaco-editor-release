/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.34.0(09be576361e93eda11c5c0f766a34aab06a1033d)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/

// src/basic-languages/go/go.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "go",
  extensions: [".go"],
  aliases: ["Go"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/go/go"], resolve, reject);
      });
    } else {
      return import("./go.js");
    }
  }
});
