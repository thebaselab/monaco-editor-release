/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.50.0(596bd541599cd083b7d07625521a36aaab18e7c8)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/


// src/basic-languages/coffee/coffee.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "coffeescript",
  extensions: [".coffee"],
  aliases: ["CoffeeScript", "coffeescript", "coffee"],
  mimetypes: ["text/x-coffeescript", "text/coffeescript"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/coffee/coffee"], resolve, reject);
      });
    } else {
      return import("./coffee.js");
    }
  }
});
