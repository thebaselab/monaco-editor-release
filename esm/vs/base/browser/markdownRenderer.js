/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from './dom.js';
import * as dompurify from './dompurify/dompurify.js';
import { DomEmitter } from './event.js';
import { createElement } from './formattedTextRenderer.js';
import { StandardKeyboardEvent } from './keyboardEvent.js';
import { StandardMouseEvent } from './mouseEvent.js';
import { renderLabelWithIcons } from './ui/iconLabel/iconLabels.js';
import { onUnexpectedError } from '../common/errors.js';
import { Event } from '../common/event.js';
import { escapeDoubleQuotes, parseHrefAndDimensions, removeMarkdownEscapes } from '../common/htmlContent.js';
import { markdownEscapeEscapedIcons } from '../common/iconLabels.js';
import { defaultGenerator } from '../common/idGenerator.js';
import { Lazy } from '../common/lazy.js';
import { DisposableStore, toDisposable } from '../common/lifecycle.js';
import { marked } from '../common/marked/marked.js';
import { parse } from '../common/marshalling.js';
import { FileAccess, Schemas } from '../common/network.js';
import { cloneAndChange } from '../common/objects.js';
import { dirname, resolvePath } from '../common/resources.js';
import { escape } from '../common/strings.js';
import { URI } from '../common/uri.js';
const defaultMarkedRenderers = Object.freeze({
    image: (href, title, text) => {
        let dimensions = [];
        let attributes = [];
        if (href) {
            ({ href, dimensions } = parseHrefAndDimensions(href));
            attributes.push(`src="${escapeDoubleQuotes(href)}"`);
        }
        if (text) {
            attributes.push(`alt="${escapeDoubleQuotes(text)}"`);
        }
        if (title) {
            attributes.push(`title="${escapeDoubleQuotes(title)}"`);
        }
        if (dimensions.length) {
            attributes = attributes.concat(dimensions);
        }
        return '<img ' + attributes.join(' ') + '>';
    },
    paragraph: (text) => {
        return `<p>${text}</p>`;
    },
    link: (href, title, text) => {
        if (typeof href !== 'string') {
            return '';
        }
        // Remove markdown escapes. Workaround for https://github.com/chjj/marked/issues/829
        if (href === text) { // raw link case
            text = removeMarkdownEscapes(text);
        }
        title = typeof title === 'string' ? escapeDoubleQuotes(removeMarkdownEscapes(title)) : '';
        href = removeMarkdownEscapes(href);
        // HTML Encode href
        href = href.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        return `<a href="${href}" title="${title || href}" draggable="false">${text}</a>`;
    },
});
/**
 * Low-level way create a html element from a markdown string.
 *
 * **Note** that for most cases you should be using [`MarkdownRenderer`](./src/vs/editor/contrib/markdownRenderer/browser/markdownRenderer.ts)
 * which comes with support for pretty code block rendering and which uses the default way of handling links.
 */
export function renderMarkdown(markdown, options = {}, markedOptions = {}) {
    var _a, _b;
    const disposables = new DisposableStore();
    let isDisposed = false;
    const element = createElement(options);
    const _uriMassage = function (part) {
        let data;
        try {
            data = parse(decodeURIComponent(part));
        }
        catch (e) {
            // ignore
        }
        if (!data) {
            return part;
        }
        data = cloneAndChange(data, value => {
            if (markdown.uris && markdown.uris[value]) {
                return URI.revive(markdown.uris[value]);
            }
            else {
                return undefined;
            }
        });
        return encodeURIComponent(JSON.stringify(data));
    };
    const _href = function (href, isDomUri) {
        const data = markdown.uris && markdown.uris[href];
        let uri = URI.revive(data);
        if (isDomUri) {
            if (href.startsWith(Schemas.data + ':')) {
                return href;
            }
            if (!uri) {
                uri = URI.parse(href);
            }
            // this URI will end up as "src"-attribute of a dom node
            // and because of that special rewriting needs to be done
            // so that the URI uses a protocol that's understood by
            // browsers (like http or https)
            return FileAccess.uriToBrowserUri(uri).toString(true);
        }
        if (!uri) {
            return href;
        }
        if (URI.parse(href).toString() === uri.toString()) {
            return href; // no transformation performed
        }
        if (uri.query) {
            uri = uri.with({ query: _uriMassage(uri.query) });
        }
        return uri.toString();
    };
    const renderer = new marked.Renderer();
    renderer.image = defaultMarkedRenderers.image;
    renderer.link = defaultMarkedRenderers.link;
    renderer.paragraph = defaultMarkedRenderers.paragraph;
    // Will collect [id, renderedElement] tuples
    const codeBlocks = [];
    const syncCodeBlocks = [];
    if (options.codeBlockRendererSync) {
        renderer.code = (code, lang) => {
            const id = defaultGenerator.nextId();
            const value = options.codeBlockRendererSync(postProcessCodeBlockLanguageId(lang), code);
            syncCodeBlocks.push([id, value]);
            return `<div class="code" data-code="${id}">${escape(code)}</div>`;
        };
    }
    else if (options.codeBlockRenderer) {
        renderer.code = (code, lang) => {
            const id = defaultGenerator.nextId();
            const value = options.codeBlockRenderer(postProcessCodeBlockLanguageId(lang), code);
            codeBlocks.push(value.then(element => [id, element]));
            return `<div class="code" data-code="${id}">${escape(code)}</div>`;
        };
    }
    if (options.actionHandler) {
        const _activateLink = function (event) {
            let target = event.target;
            if (target.tagName !== 'A') {
                target = target.parentElement;
                if (!target || target.tagName !== 'A') {
                    return;
                }
            }
            try {
                let href = target.dataset['href'];
                if (href) {
                    if (markdown.baseUri) {
                        href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
                    }
                    options.actionHandler.callback(href, event);
                }
            }
            catch (err) {
                onUnexpectedError(err);
            }
            finally {
                event.preventDefault();
            }
        };
        const onClick = options.actionHandler.disposables.add(new DomEmitter(element, 'click'));
        const onAuxClick = options.actionHandler.disposables.add(new DomEmitter(element, 'auxclick'));
        options.actionHandler.disposables.add(Event.any(onClick.event, onAuxClick.event)(e => {
            const mouseEvent = new StandardMouseEvent(DOM.getWindow(element), e);
            if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
                return;
            }
            _activateLink(mouseEvent);
        }));
        options.actionHandler.disposables.add(DOM.addDisposableListener(element, 'keydown', (e) => {
            const keyboardEvent = new StandardKeyboardEvent(e);
            if (!keyboardEvent.equals(10 /* KeyCode.Space */) && !keyboardEvent.equals(3 /* KeyCode.Enter */)) {
                return;
            }
            _activateLink(keyboardEvent);
        }));
    }
    if (!markdown.supportHtml) {
        // TODO: Can we deprecated this in favor of 'supportHtml'?
        // Use our own sanitizer so that we can let through only spans.
        // Otherwise, we'd be letting all html be rendered.
        // If we want to allow markdown permitted tags, then we can delete sanitizer and sanitize.
        // We always pass the output through dompurify after this so that we don't rely on
        // marked for sanitization.
        markedOptions.sanitizer = (html) => {
            var _a;
            if ((_a = options.sanitizerOptions) === null || _a === void 0 ? void 0 : _a.replaceWithPlaintext) {
                return escape(html);
            }
            const match = markdown.isTrusted ? html.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : undefined;
            return match ? html : '';
        };
        markedOptions.sanitize = true;
        markedOptions.silent = true;
    }
    markedOptions.renderer = renderer;
    // values that are too long will freeze the UI
    let value = (_a = markdown.value) !== null && _a !== void 0 ? _a : '';
    if (value.length > 100000) {
        value = `${value.substr(0, 100000)}…`;
    }
    // escape theme icons
    if (markdown.supportThemeIcons) {
        value = markdownEscapeEscapedIcons(value);
    }
    let renderedMarkdown;
    if (options.fillInIncompleteTokens) {
        // The defaults are applied by parse but not lexer()/parser(), and they need to be present
        const opts = {
            ...marked.defaults,
            ...markedOptions
        };
        const tokens = marked.lexer(value, opts);
        const newTokens = fillInIncompleteTokens(tokens);
        renderedMarkdown = marked.parser(newTokens, opts);
    }
    else {
        renderedMarkdown = marked.parse(value, markedOptions);
    }
    // Rewrite theme icons
    if (markdown.supportThemeIcons) {
        const elements = renderLabelWithIcons(renderedMarkdown);
        renderedMarkdown = elements.map(e => typeof e === 'string' ? e : e.outerHTML).join('');
    }
    const htmlParser = new DOMParser();
    const markdownHtmlDoc = htmlParser.parseFromString(sanitizeRenderedMarkdown({ isTrusted: markdown.isTrusted, ...options.sanitizerOptions }, renderedMarkdown), 'text/html');
    markdownHtmlDoc.body.querySelectorAll('img, audio, video, source')
        .forEach(img => {
        const src = img.getAttribute('src'); // Get the raw 'src' attribute value as text, not the resolved 'src'
        if (src) {
            let href = src;
            try {
                if (markdown.baseUri) { // absolute or relative local path, or file: uri
                    href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
                }
            }
            catch (err) { }
            img.setAttribute('src', _href(href, true));
            if (options.remoteImageIsAllowed) {
                const uri = URI.parse(href);
                if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.remoteImageIsAllowed(uri)) {
                    img.replaceWith(DOM.$('', undefined, img.outerHTML));
                }
            }
        }
    });
    markdownHtmlDoc.body.querySelectorAll('a')
        .forEach(a => {
        const href = a.getAttribute('href'); // Get the raw 'href' attribute value as text, not the resolved 'href'
        a.setAttribute('href', ''); // Clear out href. We use the `data-href` for handling clicks instead
        if (!href
            || /^data:|javascript:/i.test(href)
            || (/^command:/i.test(href) && !markdown.isTrusted)
            || /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)) {
            // drop the link
            a.replaceWith(...a.childNodes);
        }
        else {
            let resolvedHref = _href(href, false);
            if (markdown.baseUri) {
                resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
            }
            a.dataset.href = resolvedHref;
        }
    });
    element.innerHTML = sanitizeRenderedMarkdown({ isTrusted: markdown.isTrusted, ...options.sanitizerOptions }, markdownHtmlDoc.body.innerHTML);
    if (codeBlocks.length > 0) {
        Promise.all(codeBlocks).then((tuples) => {
            var _a, _b;
            if (isDisposed) {
                return;
            }
            const renderedElements = new Map(tuples);
            const placeholderElements = element.querySelectorAll(`div[data-code]`);
            for (const placeholderElement of placeholderElements) {
                const renderedElement = renderedElements.get((_a = placeholderElement.dataset['code']) !== null && _a !== void 0 ? _a : '');
                if (renderedElement) {
                    DOM.reset(placeholderElement, renderedElement);
                }
            }
            (_b = options.asyncRenderCallback) === null || _b === void 0 ? void 0 : _b.call(options);
        });
    }
    else if (syncCodeBlocks.length > 0) {
        const renderedElements = new Map(syncCodeBlocks);
        const placeholderElements = element.querySelectorAll(`div[data-code]`);
        for (const placeholderElement of placeholderElements) {
            const renderedElement = renderedElements.get((_b = placeholderElement.dataset['code']) !== null && _b !== void 0 ? _b : '');
            if (renderedElement) {
                DOM.reset(placeholderElement, renderedElement);
            }
        }
    }
    // signal size changes for image tags
    if (options.asyncRenderCallback) {
        for (const img of element.getElementsByTagName('img')) {
            const listener = disposables.add(DOM.addDisposableListener(img, 'load', () => {
                listener.dispose();
                options.asyncRenderCallback();
            }));
        }
    }
    return {
        element,
        dispose: () => {
            isDisposed = true;
            disposables.dispose();
        }
    };
}
function postProcessCodeBlockLanguageId(lang) {
    if (!lang) {
        return '';
    }
    const parts = lang.split(/[\s+|:|,|\{|\?]/, 1);
    if (parts.length) {
        return parts[0];
    }
    return lang;
}
function resolveWithBaseUri(baseUri, href) {
    const hasScheme = /^\w[\w\d+.-]*:/.test(href);
    if (hasScheme) {
        return href;
    }
    if (baseUri.path.endsWith('/')) {
        return resolvePath(baseUri, href).toString();
    }
    else {
        return resolvePath(dirname(baseUri), href).toString();
    }
}
const selfClosingTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
function sanitizeRenderedMarkdown(options, renderedMarkdown) {
    const { config, allowedSchemes } = getSanitizerOptions(options);
    const store = new DisposableStore();
    store.add(addDompurifyHook('uponSanitizeAttribute', (element, e) => {
        var _a;
        if (e.attrName === 'style' || e.attrName === 'class') {
            if (element.tagName === 'SPAN') {
                if (e.attrName === 'style') {
                    e.keepAttr = /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z]+)+\));)?$/.test(e.attrValue);
                    return;
                }
                else if (e.attrName === 'class') {
                    e.keepAttr = /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(e.attrValue);
                    return;
                }
            }
            e.keepAttr = false;
            return;
        }
        else if (element.tagName === 'INPUT' && ((_a = element.attributes.getNamedItem('type')) === null || _a === void 0 ? void 0 : _a.value) === 'checkbox') {
            if ((e.attrName === 'type' && e.attrValue === 'checkbox') || e.attrName === 'disabled' || e.attrName === 'checked') {
                e.keepAttr = true;
                return;
            }
            e.keepAttr = false;
        }
    }));
    store.add(addDompurifyHook('uponSanitizeElement', (element, e) => {
        var _a;
        if (e.tagName === 'input') {
            if (((_a = element.attributes.getNamedItem('type')) === null || _a === void 0 ? void 0 : _a.value) === 'checkbox') {
                element.setAttribute('disabled', '');
            }
            else if (!options.replaceWithPlaintext) {
                element.remove();
            }
        }
        if (options.replaceWithPlaintext && !e.allowedTags[e.tagName] && e.tagName !== 'body') {
            if (element.parentElement) {
                let startTagText;
                let endTagText;
                if (e.tagName === '#comment') {
                    startTagText = `<!--${element.textContent}-->`;
                }
                else {
                    const isSelfClosing = selfClosingTags.includes(e.tagName);
                    const attrString = element.attributes.length ?
                        ' ' + Array.from(element.attributes)
                            .map(attr => `${attr.name}="${attr.value}"`)
                            .join(' ')
                        : '';
                    startTagText = `<${e.tagName}${attrString}>`;
                    if (!isSelfClosing) {
                        endTagText = `</${e.tagName}>`;
                    }
                }
                const fragment = document.createDocumentFragment();
                const textNode = element.parentElement.ownerDocument.createTextNode(startTagText);
                fragment.appendChild(textNode);
                const endTagTextNode = endTagText ? element.parentElement.ownerDocument.createTextNode(endTagText) : undefined;
                while (element.firstChild) {
                    fragment.appendChild(element.firstChild);
                }
                if (endTagTextNode) {
                    fragment.appendChild(endTagTextNode);
                }
                element.parentElement.replaceChild(fragment, element);
            }
        }
    }));
    store.add(DOM.hookDomPurifyHrefAndSrcSanitizer(allowedSchemes));
    try {
        return dompurify.sanitize(renderedMarkdown, { ...config, RETURN_TRUSTED_TYPE: true });
    }
    finally {
        store.dispose();
    }
}
export const allowedMarkdownAttr = [
    'align',
    'autoplay',
    'alt',
    'checked',
    'class',
    'colspan',
    'controls',
    'data-code',
    'data-href',
    'disabled',
    'draggable',
    'height',
    'href',
    'loop',
    'muted',
    'playsinline',
    'poster',
    'rowspan',
    'src',
    'style',
    'target',
    'title',
    'type',
    'width',
    'start',
];
function getSanitizerOptions(options) {
    var _a;
    const allowedSchemes = [
        Schemas.http,
        Schemas.https,
        Schemas.mailto,
        Schemas.data,
        Schemas.file,
        Schemas.vscodeFileResource,
        Schemas.vscodeRemote,
        Schemas.vscodeRemoteResource,
    ];
    if (options.isTrusted) {
        allowedSchemes.push(Schemas.command);
    }
    return {
        config: {
            // allowedTags should included everything that markdown renders to.
            // Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
            // HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
            // HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
            ALLOWED_TAGS: (_a = options.allowedTags) !== null && _a !== void 0 ? _a : [...DOM.basicMarkupHtmlTags],
            ALLOWED_ATTR: allowedMarkdownAttr,
            ALLOW_UNKNOWN_PROTOCOLS: true,
        },
        allowedSchemes
    };
}
/**
 * Strips all markdown from `string`, if it's an IMarkdownString. For example
 * `# Header` would be output as `Header`. If it's not, the string is returned.
 */
export function renderStringAsPlaintext(string) {
    return typeof string === 'string' ? string : renderMarkdownAsPlaintext(string);
}
/**
 * Strips all markdown from `markdown`. For example `# Header` would be output as `Header`.
 * provide @param withCodeBlocks to retain code blocks
 */
export function renderMarkdownAsPlaintext(markdown, withCodeBlocks) {
    var _a;
    // values that are too long will freeze the UI
    let value = (_a = markdown.value) !== null && _a !== void 0 ? _a : '';
    if (value.length > 100000) {
        value = `${value.substr(0, 100000)}…`;
    }
    const html = marked.parse(value, { renderer: withCodeBlocks ? plainTextWithCodeBlocksRenderer.value : plainTextRenderer.value }).replace(/&(#\d+|[a-zA-Z]+);/g, m => { var _a; return (_a = unescapeInfo.get(m)) !== null && _a !== void 0 ? _a : m; });
    return sanitizeRenderedMarkdown({ isTrusted: false }, html).toString();
}
const unescapeInfo = new Map([
    ['&quot;', '"'],
    ['&nbsp;', ' '],
    ['&amp;', '&'],
    ['&#39;', '\''],
    ['&lt;', '<'],
    ['&gt;', '>'],
]);
function createRenderer() {
    const renderer = new marked.Renderer();
    renderer.code = (code) => {
        return code;
    };
    renderer.blockquote = (quote) => {
        return quote;
    };
    renderer.html = (_html) => {
        return '';
    };
    renderer.heading = (text, _level, _raw) => {
        return text + '\n';
    };
    renderer.hr = () => {
        return '';
    };
    renderer.list = (body, _ordered) => {
        return body;
    };
    renderer.listitem = (text) => {
        return text + '\n';
    };
    renderer.paragraph = (text) => {
        return text + '\n';
    };
    renderer.table = (header, body) => {
        return header + body + '\n';
    };
    renderer.tablerow = (content) => {
        return content;
    };
    renderer.tablecell = (content, _flags) => {
        return content + ' ';
    };
    renderer.strong = (text) => {
        return text;
    };
    renderer.em = (text) => {
        return text;
    };
    renderer.codespan = (code) => {
        return code;
    };
    renderer.br = () => {
        return '\n';
    };
    renderer.del = (text) => {
        return text;
    };
    renderer.image = (_href, _title, _text) => {
        return '';
    };
    renderer.text = (text) => {
        return text;
    };
    renderer.link = (_href, _title, text) => {
        return text;
    };
    return renderer;
}
const plainTextRenderer = new Lazy((withCodeBlocks) => createRenderer());
const plainTextWithCodeBlocksRenderer = new Lazy(() => {
    const renderer = createRenderer();
    renderer.code = (code) => {
        return `\n\`\`\`\n${code}\n\`\`\`\n`;
    };
    return renderer;
});
function mergeRawTokenText(tokens) {
    let mergedTokenText = '';
    tokens.forEach(token => {
        mergedTokenText += token.raw;
    });
    return mergedTokenText;
}
function completeSingleLinePattern(token) {
    var _a, _b;
    if (!token.tokens) {
        return undefined;
    }
    for (let i = token.tokens.length - 1; i >= 0; i--) {
        const subtoken = token.tokens[i];
        if (subtoken.type === 'text') {
            const lines = subtoken.raw.split('\n');
            const lastLine = lines[lines.length - 1];
            if (lastLine.includes('`')) {
                return completeCodespan(token);
            }
            else if (lastLine.includes('**')) {
                return completeDoublestar(token);
            }
            else if (lastLine.match(/\*\w/)) {
                return completeStar(token);
            }
            else if (lastLine.match(/(^|\s)__\w/)) {
                return completeDoubleUnderscore(token);
            }
            else if (lastLine.match(/(^|\s)_\w/)) {
                return completeUnderscore(token);
            }
            else if (
            // Text with start of link target
            hasLinkTextAndStartOfLinkTarget(lastLine) ||
                // This token doesn't have the link text, eg if it contains other markdown constructs that are in other subtokens.
                // But some preceding token does have an unbalanced [ at least
                hasStartOfLinkTargetAndNoLinkText(lastLine) && token.tokens.slice(0, i).some(t => t.type === 'text' && t.raw.match(/\[[^\]]*$/))) {
                const nextTwoSubTokens = token.tokens.slice(i + 1);
                // A markdown link can look like
                // [link text](https://microsoft.com "more text")
                // Where "more text" is a title for the link or an argument to a vscode command link
                if (
                // If the link was parsed as a link, then look for a link token and a text token with a quote
                ((_a = nextTwoSubTokens[0]) === null || _a === void 0 ? void 0 : _a.type) === 'link' && ((_b = nextTwoSubTokens[1]) === null || _b === void 0 ? void 0 : _b.type) === 'text' && nextTwoSubTokens[1].raw.match(/^ *"[^"]*$/) ||
                    // And if the link was not parsed as a link (eg command link), just look for a single quote in this token
                    lastLine.match(/^[^"]* +"[^"]*$/)) {
                    return completeLinkTargetArg(token);
                }
                return completeLinkTarget(token);
            }
            // Contains the start of link text, and no following tokens contain the link target
            else if (lastLine.match(/(^|\s)\[\w*/)) {
                return completeLinkText(token);
            }
        }
    }
    return undefined;
}
function hasLinkTextAndStartOfLinkTarget(str) {
    return !!str.match(/(^|\s)\[.*\]\(\w*/);
}
function hasStartOfLinkTargetAndNoLinkText(str) {
    return !!str.match(/^[^\[]*\]\([^\)]*$/);
}
function completeListItemPattern(list) {
    var _a;
    // Patch up this one list item
    const lastListItem = list.items[list.items.length - 1];
    const lastListSubToken = lastListItem.tokens ? lastListItem.tokens[lastListItem.tokens.length - 1] : undefined;
    /*
    Example list token structures:

    list
        list_item
            text
                text
                codespan
                link
        list_item
            text
            code // Complete indented codeblock
        list_item
            text
            space
            text
                text // Incomplete indented codeblock
        list_item
            text
            list // Nested list
                list_item
                    text
                        text

    Contrast with paragraph:
    paragraph
        text
        codespan
    */
    let newToken;
    if ((lastListSubToken === null || lastListSubToken === void 0 ? void 0 : lastListSubToken.type) === 'text' && !('inRawBlock' in lastListItem)) { // Why does Tag have a type of 'text'
        newToken = completeSingleLinePattern(lastListSubToken);
    }
    if (!newToken || newToken.type !== 'paragraph') { // 'text' item inside the list item turns into paragraph
        // Nothing to fix, or not a pattern we were expecting
        return;
    }
    const previousListItemsText = mergeRawTokenText(list.items.slice(0, -1));
    // Grabbing the `- ` or `1. ` or `* ` off the list item because I can't find a better way to do this
    const lastListItemLead = (_a = lastListItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)) === null || _a === void 0 ? void 0 : _a[0];
    if (!lastListItemLead) {
        // Is badly formatted
        return;
    }
    const newListItemText = lastListItemLead +
        mergeRawTokenText(lastListItem.tokens.slice(0, -1)) +
        newToken.raw;
    const newList = marked.lexer(previousListItemsText + newListItemText)[0];
    if (newList.type !== 'list') {
        // Something went wrong
        return;
    }
    return newList;
}
const maxIncompleteTokensFixRounds = 3;
export function fillInIncompleteTokens(tokens) {
    for (let i = 0; i < maxIncompleteTokensFixRounds; i++) {
        const newTokens = fillInIncompleteTokensOnce(tokens);
        if (newTokens) {
            tokens = newTokens;
        }
        else {
            break;
        }
    }
    return tokens;
}
function fillInIncompleteTokensOnce(tokens) {
    let i;
    let newTokens;
    for (i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let codeblockStart;
        if (token.type === 'paragraph' && (codeblockStart = token.raw.match(/(\n|^)(````*)/))) {
            const codeblockLead = codeblockStart[2];
            // If the code block was complete, it would be in a type='code'
            newTokens = completeCodeBlock(tokens.slice(i), codeblockLead);
            break;
        }
        if (token.type === 'paragraph' && token.raw.match(/(\n|^)\|/)) {
            newTokens = completeTable(tokens.slice(i));
            break;
        }
        if (i === tokens.length - 1 && token.type === 'list') {
            const newListToken = completeListItemPattern(token);
            if (newListToken) {
                newTokens = [newListToken];
                break;
            }
        }
        if (i === tokens.length - 1 && token.type === 'paragraph') {
            // Only operates on a single token, because any newline that follows this should break these patterns
            const newToken = completeSingleLinePattern(token);
            if (newToken) {
                newTokens = [newToken];
                break;
            }
        }
    }
    if (newTokens) {
        const newTokensList = [
            ...tokens.slice(0, i),
            ...newTokens
        ];
        newTokensList.links = tokens.links;
        return newTokensList;
    }
    return null;
}
function completeCodeBlock(tokens, leader) {
    const mergedRawText = mergeRawTokenText(tokens);
    return marked.lexer(mergedRawText + `\n${leader}`);
}
function completeCodespan(token) {
    return completeWithString(token, '`');
}
function completeStar(tokens) {
    return completeWithString(tokens, '*');
}
function completeUnderscore(tokens) {
    return completeWithString(tokens, '_');
}
function completeLinkTarget(tokens) {
    return completeWithString(tokens, ')');
}
function completeLinkTargetArg(tokens) {
    return completeWithString(tokens, '")');
}
function completeLinkText(tokens) {
    return completeWithString(tokens, '](https://microsoft.com)');
}
function completeDoublestar(tokens) {
    return completeWithString(tokens, '**');
}
function completeDoubleUnderscore(tokens) {
    return completeWithString(tokens, '__');
}
function completeWithString(tokens, closingString) {
    const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);
    // If it was completed correctly, this should be a single token.
    // Expecting either a Paragraph or a List
    return marked.lexer(mergedRawText + closingString)[0];
}
function completeTable(tokens) {
    const mergedRawText = mergeRawTokenText(tokens);
    const lines = mergedRawText.split('\n');
    let numCols; // The number of line1 col headers
    let hasSeparatorRow = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (typeof numCols === 'undefined' && line.match(/^\s*\|/)) {
            const line1Matches = line.match(/(\|[^\|]+)(?=\||$)/g);
            if (line1Matches) {
                numCols = line1Matches.length;
            }
        }
        else if (typeof numCols === 'number') {
            if (line.match(/^\s*\|/)) {
                if (i !== lines.length - 1) {
                    // We got the line1 header row, and the line2 separator row, but there are more lines, and it wasn't parsed as a table!
                    // That's strange and means that the table is probably malformed in the source, so I won't try to patch it up.
                    return undefined;
                }
                // Got a line2 separator row- partial or complete, doesn't matter, we'll replace it with a correct one
                hasSeparatorRow = true;
            }
            else {
                // The line after the header row isn't a valid separator row, so the table is malformed, don't fix it up
                return undefined;
            }
        }
    }
    if (typeof numCols === 'number' && numCols > 0) {
        const prefixText = hasSeparatorRow ? lines.slice(0, -1).join('\n') : mergedRawText;
        const line1EndsInPipe = !!prefixText.match(/\|\s*$/);
        const newRawText = prefixText + (line1EndsInPipe ? '' : '|') + `\n|${' --- |'.repeat(numCols)}`;
        return marked.lexer(newRawText);
    }
    return undefined;
}
function addDompurifyHook(hook, cb) {
    dompurify.addHook(hook, cb);
    return toDisposable(() => dompurify.removeHook(hook));
}
