/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from './hoverActionIds.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
var HoverAccessibilityHelpNLS;
(function (HoverAccessibilityHelpNLS) {
    HoverAccessibilityHelpNLS.introHoverPart = localize('introHoverPart', 'The focused hover part content is the following:');
    HoverAccessibilityHelpNLS.introHoverFull = localize('introHoverFull', 'The full focused hover content is the following:');
    HoverAccessibilityHelpNLS.increaseVerbosity = localize('increaseVerbosity', '- The focused hover part verbosity level can be increased with the Increase Hover Verbosity command<keybinding:{0}>.', INCREASE_HOVER_VERBOSITY_ACTION_ID);
    HoverAccessibilityHelpNLS.decreaseVerbosity = localize('decreaseVerbosity', '- The focused hover part verbosity level can be decreased with the Decrease Hover Verbosity command<keybinding:{0}>.', DECREASE_HOVER_VERBOSITY_ACTION_ID);
})(HoverAccessibilityHelpNLS || (HoverAccessibilityHelpNLS = {}));
export class HoverAccessibleView {
    dispose() {
        var _a;
        (_a = this._provider) === null || _a === void 0 ? void 0 : _a.dispose();
    }
}
export class HoverAccessibilityHelp {
    dispose() {
        var _a;
        (_a = this._provider) === null || _a === void 0 ? void 0 : _a.dispose();
    }
}
class BaseHoverAccessibleViewProvider extends Disposable {
    constructor(_hoverController) {
        super();
        this._hoverController = _hoverController;
        this._focusedHoverPartIndex = -1;
    }
    provideContentAtIndex(focusedHoverIndex, includeVerbosityActions) {
        if (focusedHoverIndex !== -1) {
            const accessibleContent = this._hoverController.getAccessibleWidgetContentAtIndex(focusedHoverIndex);
            if (accessibleContent === undefined) {
                return '';
            }
            const contents = [];
            if (includeVerbosityActions) {
                contents.push(...this._descriptionsOfVerbosityActionsForIndex(focusedHoverIndex));
            }
            contents.push(HoverAccessibilityHelpNLS.introHoverPart);
            contents.push(accessibleContent);
            return contents.join('\n\n');
        }
        else {
            const accessibleContent = this._hoverController.getAccessibleWidgetContent();
            if (accessibleContent === undefined) {
                return '';
            }
            const contents = [];
            contents.push(HoverAccessibilityHelpNLS.introHoverFull);
            contents.push(accessibleContent);
            return contents.join('\n\n');
        }
    }
    _descriptionsOfVerbosityActionsForIndex(index) {
        const content = [];
        const descriptionForIncreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Increase, index);
        if (descriptionForIncreaseAction !== undefined) {
            content.push(descriptionForIncreaseAction);
        }
        const descriptionForDecreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Decrease, index);
        if (descriptionForDecreaseAction !== undefined) {
            content.push(descriptionForDecreaseAction);
        }
        return content;
    }
    _descriptionOfVerbosityActionForIndex(action, index) {
        const isActionSupported = this._hoverController.doesHoverAtIndexSupportVerbosityAction(index, action);
        if (!isActionSupported) {
            return;
        }
        switch (action) {
            case HoverVerbosityAction.Increase:
                return HoverAccessibilityHelpNLS.increaseVerbosity;
            case HoverVerbosityAction.Decrease:
                return HoverAccessibilityHelpNLS.decreaseVerbosity;
        }
    }
}
export class HoverAccessibilityHelpProvider extends BaseHoverAccessibleViewProvider {
    constructor(hoverController) {
        super(hoverController);
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
}
export class HoverAccessibleViewProvider extends BaseHoverAccessibleViewProvider {
    constructor(_keybindingService, _editor, hoverController) {
        super(hoverController);
        this._keybindingService = _keybindingService;
        this._editor = _editor;
        this.options = { type: "view" /* AccessibleViewType.View */ };
        this._initializeOptions(this._editor, hoverController);
    }
    _initializeOptions(editor, hoverController) {
        var _a;
        const helpProvider = this._register(new HoverAccessibilityHelpProvider(hoverController));
        this.options.language = (_a = editor.getModel()) === null || _a === void 0 ? void 0 : _a.getLanguageId();
        this.options.customHelp = () => { return helpProvider.provideContentAtIndex(this._focusedHoverPartIndex, true); };
    }
}
export class ExtHoverAccessibleView {
    dispose() { }
}
