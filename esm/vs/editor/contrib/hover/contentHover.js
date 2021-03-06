/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../base/browser/dom.js';
import { HoverAction, HoverWidget } from '../../../base/browser/ui/hover/hoverWidget.js';
import { coalesce } from '../../../base/common/arrays.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Position } from '../../common/core/position.js';
import { Range } from '../../common/core/range.js';
import { ModelDecorationOptions } from '../../common/model/textModel.js';
import { TokenizationRegistry } from '../../common/languages.js';
import { ColorHoverParticipant } from './colorHoverParticipant.js';
import { HoverOperation } from './hoverOperation.js';
import { HoverRangeAnchor } from './hoverTypes.js';
import { MarkdownHoverParticipant } from './markdownHoverParticipant.js';
import { MarkerHoverParticipant } from './markerHoverParticipant.js';
import { InlineCompletionsHoverParticipant } from '../inlineCompletions/inlineCompletionsHoverParticipant.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { Context as SuggestContext } from '../suggest/suggest.js';
import { UnicodeHighlighterHoverParticipant } from '../unicodeHighlighter/unicodeHighlighter.js';
import { AsyncIterableObject } from '../../../base/common/async.js';
import { InlayHintsHover } from '../inlayHints/inlayHintsHover.js';
import { EditorContextKeys } from '../../common/editorContextKeys.js';
import { Emitter } from '../../../base/common/event.js';
const $ = dom.$;
let ContentHoverController = class ContentHoverController extends Disposable {
    constructor(_editor, _instantiationService, _keybindingService) {
        super();
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        this._keybindingService = _keybindingService;
        this._participants = [
            this._instantiationService.createInstance(ColorHoverParticipant, this._editor),
            this._instantiationService.createInstance(MarkdownHoverParticipant, this._editor),
            this._instantiationService.createInstance(InlineCompletionsHoverParticipant, this._editor),
            this._instantiationService.createInstance(UnicodeHighlighterHoverParticipant, this._editor),
            this._instantiationService.createInstance(MarkerHoverParticipant, this._editor),
            this._instantiationService.createInstance(InlayHintsHover, this._editor),
        ];
        this._widget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
        this._decorationsChangerListener = this._register(new EditorDecorationsChangerListener(this._editor));
        this._computer = new ContentHoverComputer(this._editor, this._participants);
        this._hoverOperation = this._register(new HoverOperation(this._editor, this._computer));
        this._messages = [];
        this._messagesAreComplete = false;
        this._register(this._hoverOperation.onResult((result) => {
            this._withResult(result.value, result.isComplete, result.hasLoadingMessage);
        }));
        this._register(this._decorationsChangerListener.onDidChangeModelDecorations(() => this._onModelDecorationsChanged()));
        this._register(dom.addStandardDisposableListener(this._widget.getDomNode(), 'keydown', (e) => {
            if (e.equals(9 /* Escape */)) {
                this.hide();
            }
        }));
        this._register(TokenizationRegistry.onDidChange(() => {
            if (this._widget.position && this._computer.anchor && this._messages.length > 0) {
                this._widget.clear();
                this._renderMessages(this._computer.anchor, this._messages);
            }
        }));
    }
    _onModelDecorationsChanged() {
        if (this._widget.position) {
            // The decorations have changed and the hover is visible,
            // we need to recompute the displayed text
            this._hoverOperation.cancel();
            if (!this._widget.colorPicker) { // TODO@Michel ensure that displayed text for other decorations is computed even if color picker is in place
                this._hoverOperation.start(0 /* Delayed */);
            }
        }
    }
    maybeShowAt(mouseEvent) {
        const anchorCandidates = [];
        for (const participant of this._participants) {
            if (participant.suggestHoverAnchor) {
                const anchor = participant.suggestHoverAnchor(mouseEvent);
                if (anchor) {
                    anchorCandidates.push(anchor);
                }
            }
        }
        const target = mouseEvent.target;
        if (target.type === 6 /* CONTENT_TEXT */) {
            anchorCandidates.push(new HoverRangeAnchor(0, target.range));
        }
        if (target.type === 7 /* CONTENT_EMPTY */) {
            const epsilon = this._editor.getOption(44 /* fontInfo */).typicalHalfwidthCharacterWidth / 2;
            if (!target.detail.isAfterLines && typeof target.detail.horizontalDistanceToText === 'number' && target.detail.horizontalDistanceToText < epsilon) {
                // Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
                anchorCandidates.push(new HoverRangeAnchor(0, target.range));
            }
        }
        if (anchorCandidates.length === 0) {
            return false;
        }
        anchorCandidates.sort((a, b) => b.priority - a.priority);
        this._startShowingAt(anchorCandidates[0], 0 /* Delayed */, false);
        return true;
    }
    startShowingAtRange(range, mode, focus) {
        this._startShowingAt(new HoverRangeAnchor(0, range), mode, focus);
    }
    _startShowingAt(anchor, mode, focus) {
        if (this._computer.anchor && this._computer.anchor.equals(anchor)) {
            // We have to show the widget at the exact same range as before, so no work is needed
            return;
        }
        this._hoverOperation.cancel();
        if (this._widget.position) {
            // The range might have changed, but the hover is visible
            // Instead of hiding it completely, filter out messages that are still in the new range and
            // kick off a new computation
            if (!this._computer.anchor || !anchor.canAdoptVisibleHover(this._computer.anchor, this._widget.position)) {
                this.hide();
            }
            else {
                const filteredMessages = this._messages.filter((m) => m.isValidForHoverAnchor(anchor));
                if (filteredMessages.length === 0) {
                    this.hide();
                }
                else if (filteredMessages.length === this._messages.length && this._messagesAreComplete) {
                    // no change
                    return;
                }
                else {
                    this._renderMessages(anchor, filteredMessages);
                }
            }
        }
        this._computer.anchor = anchor;
        this._computer.shouldFocus = focus;
        this._hoverOperation.start(mode);
    }
    hide() {
        this._computer.anchor = null;
        this._hoverOperation.cancel();
        this._widget.hide();
    }
    isColorPickerVisible() {
        return !!this._widget.colorPicker;
    }
    _addLoadingMessage(result) {
        if (this._computer.anchor) {
            for (const participant of this._participants) {
                if (participant.createLoadingMessage) {
                    const loadingMessage = participant.createLoadingMessage(this._computer.anchor);
                    if (loadingMessage) {
                        return result.slice(0).concat([loadingMessage]);
                    }
                }
            }
        }
        return result;
    }
    _withResult(result, isComplete, hasLoadingMessage) {
        this._messages = (hasLoadingMessage ? this._addLoadingMessage(result) : result);
        this._messagesAreComplete = isComplete;
        if (this._computer.anchor && this._messages.length > 0) {
            this._renderMessages(this._computer.anchor, this._messages);
        }
        else if (isComplete) {
            this.hide();
        }
    }
    _renderMessages(anchor, messages) {
        // update column from which to show
        let renderColumn = 1073741824 /* MAX_SAFE_SMALL_INTEGER */;
        let highlightRange = messages[0].range;
        let forceShowAtRange = null;
        for (const msg of messages) {
            renderColumn = Math.min(renderColumn, msg.range.startColumn);
            highlightRange = Range.plusRange(highlightRange, msg.range);
            if (msg.forceShowAtRange) {
                forceShowAtRange = msg.range;
            }
        }
        const disposables = new DisposableStore();
        const statusBar = disposables.add(new EditorHoverStatusBar(this._keybindingService));
        const fragment = document.createDocumentFragment();
        let colorPicker = null;
        const context = {
            fragment,
            statusBar,
            setColorPicker: (widget) => colorPicker = widget,
            onContentsChanged: () => this._widget.onContentsChanged(),
            hide: () => this.hide()
        };
        for (const participant of this._participants) {
            const hoverParts = messages.filter(msg => msg.owner === participant);
            if (hoverParts.length > 0) {
                disposables.add(participant.renderHoverParts(context, hoverParts));
            }
        }
        if (statusBar.hasContent) {
            fragment.appendChild(statusBar.hoverElement);
        }
        if (fragment.hasChildNodes()) {
            if (highlightRange) {
                const highlightDecorations = this._decorationsChangerListener.deltaDecorations([], [{
                        range: highlightRange,
                        options: ContentHoverController._DECORATION_OPTIONS
                    }]);
                disposables.add(toDisposable(() => {
                    this._decorationsChangerListener.deltaDecorations(highlightDecorations, []);
                }));
            }
            this._widget.showAt(fragment, new ContentHoverVisibleData(colorPicker, forceShowAtRange ? forceShowAtRange.getStartPosition() : new Position(anchor.range.startLineNumber, renderColumn), forceShowAtRange ? forceShowAtRange : highlightRange, this._editor.getOption(53 /* hover */).above, this._computer.shouldFocus, disposables));
        }
        else {
            disposables.dispose();
        }
    }
};
ContentHoverController._DECORATION_OPTIONS = ModelDecorationOptions.register({
    description: 'content-hover-highlight',
    className: 'hoverHighlight'
});
ContentHoverController = __decorate([
    __param(1, IInstantiationService),
    __param(2, IKeybindingService)
], ContentHoverController);
export { ContentHoverController };
/**
 * Allows listening to `ICodeEditor.onDidChangeModelDecorations` and ignores the change caused by itself.
 */
class EditorDecorationsChangerListener extends Disposable {
    constructor(_editor) {
        super();
        this._editor = _editor;
        this._onDidChangeModelDecorations = this._register(new Emitter());
        this.onDidChangeModelDecorations = this._onDidChangeModelDecorations.event;
        this._isChangingDecorations = false;
        this._register(this._editor.onDidChangeModelDecorations((e) => {
            if (this._isChangingDecorations) {
                return;
            }
            this._onDidChangeModelDecorations.fire(e);
        }));
    }
    deltaDecorations(oldDecorations, newDecorations) {
        try {
            this._isChangingDecorations = true;
            return this._editor.deltaDecorations(oldDecorations, newDecorations);
        }
        finally {
            this._isChangingDecorations = false;
        }
    }
}
class ContentHoverVisibleData {
    constructor(colorPicker, showAtPosition, showAtRange, preferAbove, stoleFocus, disposables) {
        this.colorPicker = colorPicker;
        this.showAtPosition = showAtPosition;
        this.showAtRange = showAtRange;
        this.preferAbove = preferAbove;
        this.stoleFocus = stoleFocus;
        this.disposables = disposables;
    }
}
let ContentHoverWidget = class ContentHoverWidget extends Disposable {
    constructor(_editor, _contextKeyService) {
        super();
        this._editor = _editor;
        this._contextKeyService = _contextKeyService;
        this.allowEditorOverflow = true;
        this._hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
        this._hover = this._register(new HoverWidget());
        this._visibleData = null;
        this._register(this._editor.onDidLayoutChange(() => this._layout()));
        this._register(this._editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(44 /* fontInfo */)) {
                this._updateFont();
            }
        }));
        this._setVisibleData(null);
        this._layout();
        this._editor.addContentWidget(this);
    }
    /**
     * Returns `null` if the hover is not visible.
     */
    get position() {
        var _a, _b;
        return (_b = (_a = this._visibleData) === null || _a === void 0 ? void 0 : _a.showAtPosition) !== null && _b !== void 0 ? _b : null;
    }
    /**
     * Returns `null` if the color picker is not visible.
     */
    get colorPicker() {
        var _a, _b;
        return (_b = (_a = this._visibleData) === null || _a === void 0 ? void 0 : _a.colorPicker) !== null && _b !== void 0 ? _b : null;
    }
    dispose() {
        this._editor.removeContentWidget(this);
        if (this._visibleData) {
            this._visibleData.disposables.dispose();
        }
        super.dispose();
    }
    getId() {
        return ContentHoverWidget.ID;
    }
    getDomNode() {
        return this._hover.containerDomNode;
    }
    getPosition() {
        if (!this._visibleData) {
            return null;
        }
        let preferAbove = this._visibleData.preferAbove;
        if (!preferAbove && this._contextKeyService.getContextKeyValue(SuggestContext.Visible.key)) {
            // Prefer rendering above if the suggest widget is visible
            preferAbove = true;
        }
        return {
            position: this._visibleData.showAtPosition,
            range: this._visibleData.showAtRange,
            preference: (preferAbove
                ? [1 /* ABOVE */, 2 /* BELOW */]
                : [2 /* BELOW */, 1 /* ABOVE */]),
        };
    }
    _setVisibleData(visibleData) {
        if (this._visibleData) {
            this._visibleData.disposables.dispose();
        }
        this._visibleData = visibleData;
        this._hoverVisibleKey.set(!!this._visibleData);
        this._hover.containerDomNode.classList.toggle('hidden', !this._visibleData);
    }
    _layout() {
        const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
        const { fontSize, lineHeight } = this._editor.getOption(44 /* fontInfo */);
        this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
        this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
        this._hover.contentsDomNode.style.maxHeight = `${height}px`;
        this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
    }
    _updateFont() {
        const codeClasses = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
        codeClasses.forEach(node => this._editor.applyFontInfo(node));
    }
    showAt(node, visibleData) {
        this._setVisibleData(visibleData);
        this._hover.contentsDomNode.textContent = '';
        this._hover.contentsDomNode.appendChild(node);
        this._updateFont();
        this._editor.layoutContentWidget(this);
        this._hover.onContentsChanged();
        // Simply force a synchronous render on the editor
        // such that the widget does not really render with left = '0px'
        this._editor.render();
        // See https://github.com/microsoft/vscode/issues/140339
        // TODO: Doing a second layout of the hover after force rendering the editor
        this._editor.layoutContentWidget(this);
        this._hover.onContentsChanged();
        if (visibleData.stoleFocus) {
            this._hover.containerDomNode.focus();
        }
        if (visibleData.colorPicker) {
            visibleData.colorPicker.layout();
        }
    }
    hide() {
        if (this._visibleData) {
            const stoleFocus = this._visibleData.stoleFocus;
            this._setVisibleData(null);
            this._editor.layoutContentWidget(this);
            if (stoleFocus) {
                this._editor.focus();
            }
        }
    }
    onContentsChanged() {
        this._hover.onContentsChanged();
    }
    clear() {
        this._hover.contentsDomNode.textContent = '';
    }
};
ContentHoverWidget.ID = 'editor.contrib.contentHoverWidget';
ContentHoverWidget = __decorate([
    __param(1, IContextKeyService)
], ContentHoverWidget);
export { ContentHoverWidget };
let EditorHoverStatusBar = class EditorHoverStatusBar extends Disposable {
    constructor(_keybindingService) {
        super();
        this._keybindingService = _keybindingService;
        this._hasContent = false;
        this.hoverElement = $('div.hover-row.status-bar');
        this.actionsElement = dom.append(this.hoverElement, $('div.actions'));
    }
    get hasContent() {
        return this._hasContent;
    }
    addAction(actionOptions) {
        const keybinding = this._keybindingService.lookupKeybinding(actionOptions.commandId);
        const keybindingLabel = keybinding ? keybinding.getLabel() : null;
        this._hasContent = true;
        return this._register(HoverAction.render(this.actionsElement, actionOptions, keybindingLabel));
    }
    append(element) {
        const result = dom.append(this.actionsElement, element);
        this._hasContent = true;
        return result;
    }
};
EditorHoverStatusBar = __decorate([
    __param(0, IKeybindingService)
], EditorHoverStatusBar);
class ContentHoverComputer {
    constructor(_editor, _participants) {
        this._editor = _editor;
        this._participants = _participants;
        this._anchor = null;
        this._shouldFocus = false;
    }
    get anchor() { return this._anchor; }
    set anchor(value) { this._anchor = value; }
    get shouldFocus() { return this._shouldFocus; }
    set shouldFocus(value) { this._shouldFocus = value; }
    static _getLineDecorations(editor, anchor) {
        if (anchor.type !== 1 /* Range */) {
            return [];
        }
        const model = editor.getModel();
        const lineNumber = anchor.range.startLineNumber;
        const maxColumn = model.getLineMaxColumn(lineNumber);
        return editor.getLineDecorations(lineNumber).filter((d) => {
            if (d.options.isWholeLine) {
                return true;
            }
            const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
            const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
            if (d.options.showIfCollapsed) {
                // Relax check around `showIfCollapsed` decorations to also include +/- 1 character
                if (startColumn > anchor.range.startColumn + 1 || anchor.range.endColumn - 1 > endColumn) {
                    return false;
                }
            }
            else {
                if (startColumn > anchor.range.startColumn || anchor.range.endColumn > endColumn) {
                    return false;
                }
            }
            return true;
        });
    }
    computeAsync(token) {
        const anchor = this._anchor;
        if (!this._editor.hasModel() || !anchor) {
            return AsyncIterableObject.EMPTY;
        }
        const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, anchor);
        return AsyncIterableObject.merge(this._participants.map((participant) => {
            if (!participant.computeAsync) {
                return AsyncIterableObject.EMPTY;
            }
            return participant.computeAsync(anchor, lineDecorations, token);
        }));
    }
    computeSync() {
        if (!this._editor.hasModel() || !this._anchor) {
            return [];
        }
        const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, this._anchor);
        let result = [];
        for (const participant of this._participants) {
            result = result.concat(participant.computeSync(this._anchor, lineDecorations));
        }
        return coalesce(result);
    }
}
