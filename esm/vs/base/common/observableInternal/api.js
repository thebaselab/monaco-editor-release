/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEquals } from '../equals.js';
import { ObservableValue } from './base.js';
import { DebugNameData } from './debugName.js';
import { LazyObservableValue } from './lazyObservableValue.js';
export function observableValueOpts(options, initialValue) {
    var _a, _b;
    if (options.lazy) {
        return new LazyObservableValue(new DebugNameData(options.owner, options.debugName, undefined), initialValue, (_a = options.equalsFn) !== null && _a !== void 0 ? _a : strictEquals);
    }
    return new ObservableValue(new DebugNameData(options.owner, options.debugName, undefined), initialValue, (_b = options.equalsFn) !== null && _b !== void 0 ? _b : strictEquals);
}
