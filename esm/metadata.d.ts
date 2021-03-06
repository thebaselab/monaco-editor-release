
/*!----------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *----------------------------------------------------------------*/

export interface IWorkerDefinition {
	id: string;
	entry: string;
}

export interface IFeatureDefinition {
	label: string;
	entry: string | string[] | undefined;
	worker?: IWorkerDefinition;
}

export const features: IFeatureDefinition[];

export const languages: IFeatureDefinition[];

export type EditorLanguage = 'abap' | 'apex' | 'azcli' | 'bat' | 'bicep' | 'cameligo' | 'clojure' | 'coffee' | 'cpp' | 'csharp' | 'csp' | 'css' | 'dart' | 'dockerfile' | 'ecl' | 'elixir' | 'flow9' | 'freemarker2' | 'fsharp' | 'go' | 'graphql' | 'handlebars' | 'hcl' | 'html' | 'ini' | 'java' | 'javascript' | 'json' | 'julia' | 'kotlin' | 'less' | 'lexon' | 'liquid' | 'lua' | 'm3' | 'markdown' | 'mips' | 'msdax' | 'mysql' | 'objective-c' | 'pascal' | 'pascaligo' | 'perl' | 'pgsql' | 'php' | 'pla' | 'postiats' | 'powerquery' | 'powershell' | 'protobuf' | 'pug' | 'python' | 'qsharp' | 'r' | 'razor' | 'redis' | 'redshift' | 'restructuredtext' | 'ruby' | 'rust' | 'sb' | 'scala' | 'scheme' | 'scss' | 'shell' | 'solidity' | 'sophia' | 'sparql' | 'sql' | 'st' | 'swift' | 'systemverilog' | 'tcl' | 'twig' | 'typescript' | 'vb' | 'xml' | 'yaml';

export type EditorFeature = 'accessibilityHelp' | 'anchorSelect' | 'bracketMatching' | 'caretOperations' | 'clipboard' | 'codeAction' | 'codelens' | 'colorPicker' | 'comment' | 'contextmenu' | 'coreCommands' | 'cursorUndo' | 'dnd' | 'documentSymbols' | 'find' | 'folding' | 'fontZoom' | 'format' | 'gotoError' | 'gotoLine' | 'gotoSymbol' | 'hover' | 'iPadShowKeyboard' | 'inPlaceReplace' | 'indentation' | 'inlayHints' | 'inlineCompletions' | 'inspectTokens' | 'lineSelection' | 'linesOperations' | 'linkedEditing' | 'links' | 'multicursor' | 'parameterHints' | 'quickCommand' | 'quickHelp' | 'quickOutline' | 'referenceSearch' | 'rename' | 'smartSelect' | 'snippets' | 'suggest' | 'toggleHighContrast' | 'toggleTabFocusMode' | 'transpose' | 'unicodeHighlighter' | 'unusualLineTerminators' | 'viewportSemanticTokens' | 'wordHighlighter' | 'wordOperations' | 'wordPartOperations';

export type NegatedEditorFeature = '!accessibilityHelp' | '!anchorSelect' | '!bracketMatching' | '!caretOperations' | '!clipboard' | '!codeAction' | '!codelens' | '!colorPicker' | '!comment' | '!contextmenu' | '!coreCommands' | '!cursorUndo' | '!dnd' | '!documentSymbols' | '!find' | '!folding' | '!fontZoom' | '!format' | '!gotoError' | '!gotoLine' | '!gotoSymbol' | '!hover' | '!iPadShowKeyboard' | '!inPlaceReplace' | '!indentation' | '!inlayHints' | '!inlineCompletions' | '!inspectTokens' | '!lineSelection' | '!linesOperations' | '!linkedEditing' | '!links' | '!multicursor' | '!parameterHints' | '!quickCommand' | '!quickHelp' | '!quickOutline' | '!referenceSearch' | '!rename' | '!smartSelect' | '!snippets' | '!suggest' | '!toggleHighContrast' | '!toggleTabFocusMode' | '!transpose' | '!unicodeHighlighter' | '!unusualLineTerminators' | '!viewportSemanticTokens' | '!wordHighlighter' | '!wordOperations' | '!wordPartOperations';

