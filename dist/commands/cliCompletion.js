"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCompletionScript = exports.renderCompletionHelp = exports.isCompletionShell = exports.COMMAND_COMPLETION_SPEC_BY_NAME = exports.COMMAND_COMPLETION_SPECS = exports.COMPLETION_SHELLS = void 0;
const commandCatalog_1 = require("./commandCatalog");
exports.COMPLETION_SHELLS = ["bash", "zsh", "fish"];
const COMPLETION_SHELL_SET = new Set(exports.COMPLETION_SHELLS);
const FILESYSTEM_HINT_PATTERN = /(?:^|[-_])(path|dir|file|wheel|venv)(?:$|[-_])/i;
const FILESYSTEM_FLAG_KEYS = new Set([
    "entry",
    "left",
    "local",
    "mesh-dir",
    "out",
    "out-dir",
    "path",
    "python",
    "right",
    "root",
    "urdf",
    "venv",
    "wheel",
    "xacro",
]);
const VALUE_CHOICES_BY_FLAG = {
    axis: ["x", "y", "z"],
    "target-axis": ["x", "y", "z"],
    "target-up": ["x", "y", "z"],
    "target-forward": ["x", "y", "z"],
    "source-up": ["+x", "+y", "+z", "-x", "-y", "-z"],
    "source-forward": ["+x", "+y", "+z", "-x", "-y", "-z"],
    type: ["revolute", "continuous", "prismatic", "fixed", "floating", "planar"],
};
const getCommandSummary = (commandName) => {
    const section = commandCatalog_1.CLI_HELP_SECTIONS.find((entry) => entry.commands.includes(commandName));
    return section?.summary ?? section?.title ?? "CLI command";
};
const tokenizeUsageSyntax = (usageLine) => {
    const tokens = [];
    let index = 0;
    while (index < usageLine.length) {
        const character = usageLine[index];
        if (!character) {
            break;
        }
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (character === "[" || character === "]" || character === "|") {
            tokens.push(character);
            index += 1;
            continue;
        }
        if (character === "<") {
            const endIndex = usageLine.indexOf(">", index + 1);
            if (endIndex === -1) {
                tokens.push(usageLine.slice(index));
                break;
            }
            tokens.push(usageLine.slice(index, endIndex + 1));
            index = endIndex + 1;
            continue;
        }
        if (character === '"' || character === "'") {
            const quote = character;
            let endIndex = index + 1;
            while (endIndex < usageLine.length && usageLine[endIndex] !== quote) {
                endIndex += 1;
            }
            const sliceEnd = endIndex < usageLine.length ? endIndex + 1 : usageLine.length;
            tokens.push(usageLine.slice(index, sliceEnd));
            index = sliceEnd;
            continue;
        }
        let endIndex = index + 1;
        while (endIndex < usageLine.length) {
            const nextCharacter = usageLine[endIndex];
            if (!nextCharacter || /\s/.test(nextCharacter) || nextCharacter === "[" || nextCharacter === "]" || nextCharacter === "|") {
                break;
            }
            endIndex += 1;
        }
        tokens.push(usageLine.slice(index, endIndex));
        index = endIndex;
    }
    return tokens;
};
const normalizeValueHint = (token) => {
    if ((token.startsWith("<") && token.endsWith(">")) ||
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
        return token.slice(1, -1);
    }
    return token;
};
const getOptionValueToken = (tokens, index) => {
    const nextToken = tokens[index + 1];
    if (!nextToken || nextToken === "[" || nextToken === "]" || nextToken === "|" || nextToken.startsWith("--")) {
        return undefined;
    }
    return nextToken;
};
const isFilesystemOption = (flagKey, valueHint) => {
    if (FILESYSTEM_FLAG_KEYS.has(flagKey)) {
        return true;
    }
    if (valueHint && FILESYSTEM_HINT_PATTERN.test(valueHint)) {
        return true;
    }
    return FILESYSTEM_HINT_PATTERN.test(flagKey);
};
const deriveOptionSpecs = (commandName) => {
    const optionByFlag = new Map();
    for (const usageLine of commandCatalog_1.COMMAND_CATALOG[commandName].usage) {
        const tokens = tokenizeUsageSyntax(usageLine);
        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (!token.startsWith("--")) {
                continue;
            }
            const flagKey = token.slice(2);
            const valueToken = getOptionValueToken(tokens, index);
            const valueHint = valueToken ? normalizeValueHint(valueToken).trim() : undefined;
            const existing = optionByFlag.get(flagKey);
            const nextSpec = existing
                ? { ...existing }
                : {
                    flag: `--${flagKey}`,
                };
            if (valueHint && !nextSpec.valueHint) {
                nextSpec.valueHint = valueHint;
            }
            if (!nextSpec.valueChoices && VALUE_CHOICES_BY_FLAG[flagKey]) {
                nextSpec.valueChoices = VALUE_CHOICES_BY_FLAG[flagKey];
            }
            if (isFilesystemOption(flagKey, valueHint)) {
                nextSpec.isFilesystemPath = true;
            }
            optionByFlag.set(flagKey, nextSpec);
            if (valueToken) {
                index += 1;
            }
        }
    }
    return Array.from(optionByFlag.values());
};
const deriveRequiredAlternatives = (commandName) => {
    const alternatives = [];
    const seen = new Set();
    for (const usageLine of commandCatalog_1.COMMAND_CATALOG[commandName].usage) {
        const tokens = tokenizeUsageSyntax(usageLine).slice(1);
        let optionalDepth = 0;
        let currentAlternative = [];
        const pushAlternative = () => {
            if (currentAlternative.length === 0) {
                return;
            }
            const signature = currentAlternative.join("\u0000");
            if (!seen.has(signature)) {
                seen.add(signature);
                alternatives.push(currentAlternative);
            }
            currentAlternative = [];
        };
        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (token === "[") {
                optionalDepth += 1;
                continue;
            }
            if (token === "]") {
                optionalDepth = Math.max(0, optionalDepth - 1);
                continue;
            }
            if (optionalDepth > 0) {
                continue;
            }
            if (token === "|") {
                pushAlternative();
                continue;
            }
            if (!token.startsWith("--")) {
                continue;
            }
            currentAlternative.push(token.slice(2));
            if (getOptionValueToken(tokens, index)) {
                index += 1;
            }
        }
        pushAlternative();
    }
    return alternatives;
};
exports.COMMAND_COMPLETION_SPECS = commandCatalog_1.SUPPORTED_COMMANDS.map((commandName) => ({
    name: commandName,
    summary: getCommandSummary(commandName),
    options: deriveOptionSpecs(commandName),
    requiredAlternatives: deriveRequiredAlternatives(commandName),
}));
exports.COMMAND_COMPLETION_SPEC_BY_NAME = Object.fromEntries(exports.COMMAND_COMPLETION_SPECS.map((entry) => [entry.name, entry]));
const TOP_LEVEL_SPECS = [
    { name: "help", summary: "Show CLI help." },
    { name: "resume", summary: "Resume the most recent shared ilu session." },
    { name: "attach", summary: "Attach the terminal to an existing shared ilu session." },
    { name: "doctor", summary: "Inspect runtime, support, auth, and xacro diagnostics." },
    { name: "bug-report", summary: "Write a support bundle with diagnostics and optional local inputs." },
    { name: "update", summary: "Update ilu to the latest published npm release." },
    { name: "shell", summary: "Start the interactive slash-command shell." },
    { name: "completion", summary: "Generate shell completion scripts." },
    ...exports.COMMAND_COMPLETION_SPECS.map((entry) => ({
        name: entry.name,
        summary: entry.summary,
    })),
];
const HELP_TOPIC_SPECS = [
    { name: "resume", summary: "Resume the most recent shared ilu session." },
    { name: "attach", summary: "Attach the terminal to an existing shared ilu session." },
    { name: "doctor", summary: "Inspect runtime, support, auth, and xacro diagnostics." },
    { name: "bug-report", summary: "Write a support bundle with diagnostics and optional local inputs." },
    { name: "update", summary: "Update ilu to the latest published npm release." },
    { name: "shell", summary: "Start the interactive slash-command shell." },
    { name: "completion", summary: "Generate shell completion scripts." },
    ...exports.COMMAND_COMPLETION_SPECS.map((entry) => ({
        name: entry.name,
        summary: entry.summary,
    })),
];
const quoteJson = (value) => JSON.stringify(value);
const renderWordList = (values) => quoteJson(values.join(" "));
const renderBashCase = (entry) => {
    const optionWords = entry.options.map((option) => option.flag);
    const optionCases = [];
    for (const option of entry.options) {
        if (option.valueChoices && option.valueChoices.length > 0) {
            optionCases.push(`        ${option.flag}) COMPREPLY=( $(compgen -W ${renderWordList(option.valueChoices)} -- "$cur") ); return 0 ;;`);
            continue;
        }
        if (option.isFilesystemPath) {
            optionCases.push(`        ${option.flag}) COMPREPLY=( $(compgen -f -- "$cur") ); return 0 ;;`);
        }
    }
    return [
        `    ${entry.name})`,
        optionCases.length > 0 ? `      case "$prev" in\n${optionCases.join("\n")}\n      esac` : null,
        optionWords.length > 0
            ? `      if [[ $COMP_CWORD -eq 2 || "$cur" == --* ]]; then\n        COMPREPLY=( $(compgen -W ${renderWordList(optionWords)} -- "$cur") )\n        return 0\n      fi`
            : null,
        "      ;;",
    ]
        .filter((line) => Boolean(line))
        .join("\n");
};
const renderBashCompletion = () => {
    return [
        "_ilu() {",
        "  local cur prev command",
        "  COMPREPLY=()",
        '  cur="${COMP_WORDS[COMP_CWORD]}"',
        '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
        "",
        "  if [[ $COMP_CWORD -eq 1 ]]; then",
        `    COMPREPLY=( $(compgen -W ${renderWordList(TOP_LEVEL_SPECS.map((entry) => entry.name))} -- "$cur") )`,
        "    return 0",
        "  fi",
        "",
        '  if [[ "${COMP_WORDS[1]}" == "help" ]]; then',
        `    COMPREPLY=( $(compgen -W ${renderWordList(HELP_TOPIC_SPECS.map((entry) => entry.name))} -- "$cur") )`,
        "    return 0",
        "  fi",
        "",
        '  if [[ "${COMP_WORDS[1]}" == "completion" ]]; then',
        "    if [[ $COMP_CWORD -eq 2 ]]; then",
        `      COMPREPLY=( $(compgen -W ${renderWordList(exports.COMPLETION_SHELLS)} -- "$cur") )`,
        "    fi",
        "    return 0",
        "  fi",
        "",
        '  if [[ "${COMP_WORDS[1]}" == "doctor" ]]; then',
        "    if [[ $COMP_CWORD -eq 2 ]]; then",
        '      COMPREPLY=( $(compgen -W "--json --help" -- "$cur") )',
        "    fi",
        "    return 0",
        "  fi",
        "",
        '  if [[ "${COMP_WORDS[1]}" == "bug-report" ]]; then',
        "    if [[ $COMP_CWORD -eq 2 || \"$cur\" == --* ]]; then",
        '      COMPREPLY=( $(compgen -W "--out --urdf --source --help" -- "$cur") )',
        "    elif [[ \"$prev\" == \"--out\" || \"$prev\" == \"--urdf\" || \"$prev\" == \"--source\" ]]; then",
        '      COMPREPLY=( $(compgen -f -- "$cur") )',
        "    fi",
        "    return 0",
        "  fi",
        "",
        '  command="${COMP_WORDS[1]}"',
        '  case "$command" in',
        ...exports.COMMAND_COMPLETION_SPECS.map((entry) => renderBashCase(entry)),
        "  esac",
        "}",
        "",
        "complete -o bashdefault -o default -F _ilu ilu",
    ].join("\n");
};
const renderZshCommandItems = (entries) => entries.map((entry) => `  ${quoteJson(`${entry.name}:${entry.summary}`)}`).join("\n");
const renderZshOptionItems = (entry) => entry.options
    .map((option) => {
    const description = option.valueHint ?? "option";
    return `  ${quoteJson(`${option.flag}[${description}]`)}`;
})
    .join("\n");
const renderZshPreviousValueCases = (entry) => {
    const valueCases = [];
    for (const option of entry.options) {
        if (option.valueChoices && option.valueChoices.length > 0) {
            valueCases.push(`      ${option.flag})\n        _values ${quoteJson(option.valueHint ?? option.flag)} ${option.valueChoices.map((value) => quoteJson(value)).join(" ")}\n        return\n        ;;`);
            continue;
        }
        if (option.isFilesystemPath) {
            valueCases.push(`      ${option.flag})\n        _files\n        return\n        ;;`);
        }
    }
    return valueCases;
};
const renderZshCase = (entry) => {
    const previousValueCases = renderZshPreviousValueCases(entry);
    const optionItems = renderZshOptionItems(entry);
    return [
        `  ${entry.name})`,
        previousValueCases.length > 0 ? `    case "$prev" in\n${previousValueCases.join("\n")}\n    esac` : null,
        entry.options.length > 0
            ? `    if (( CURRENT == 3 )) || [[ "$cur" == --* ]]; then\n      local -a options\n      options=(\n${optionItems}\n      )\n      _describe -t options 'options' options\n      return\n    fi`
            : null,
        "    ;;",
    ]
        .filter((line) => Boolean(line))
        .join("\n");
};
const renderZshCompletion = () => {
    return [
        "#compdef ilu",
        "",
        "local cur prev command",
        'cur="${words[CURRENT]}"',
        'prev="${words[CURRENT-1]}"',
        "",
        "local -a top_level_commands",
        "top_level_commands=(",
        renderZshCommandItems(TOP_LEVEL_SPECS),
        ")",
        "",
        "if (( CURRENT == 2 )); then",
        "  _describe -t commands 'ilu command' top_level_commands",
        "  return",
        "fi",
        "",
        'command="${words[2]}"',
        "",
        'if [[ "$command" == "help" ]]; then',
        "  local -a help_topics",
        "  help_topics=(",
        renderZshCommandItems(HELP_TOPIC_SPECS),
        "  )",
        "  _describe -t commands 'ilu command' help_topics",
        "  return",
        "fi",
        "",
        'if [[ "$command" == "completion" ]]; then',
        "  if (( CURRENT == 3 )); then",
        "    local -a shells",
        "    shells=(",
        ...exports.COMPLETION_SHELLS.map((shell) => `      ${quoteJson(`${shell}:${shell} completion script`)}`),
        "    )",
        "    _describe -t shells 'shell' shells",
        "  fi",
        "  return",
        "fi",
        "",
        'if [[ "$command" == "doctor" ]]; then',
        "  local -a doctor_options",
        "  doctor_options=(",
        `    ${quoteJson("--json:emit machine-readable diagnostics")}`,
        `    ${quoteJson("--help:show doctor help")}`,
        "  )",
        "  _describe -t options 'doctor options' doctor_options",
        "  return",
        "fi",
        "",
        'if [[ "$command" == "bug-report" ]]; then',
        "  case \"$prev\" in",
        "    --out|--urdf|--source)",
        "      _files",
        "      return",
        "      ;;",
        "  esac",
        "  local -a bug_report_options",
        "  bug_report_options=(",
        `    ${quoteJson("--out[output directory]:directory:_files")}`,
        `    ${quoteJson("--urdf[attach a local URDF file]:file:_files")}`,
        `    ${quoteJson("--source[attach a local source file or directory]:path:_files")}`,
        `    ${quoteJson("--help[show bug-report help]")}`,
        "  )",
        "  _describe -t options 'bug-report options' bug_report_options",
        "  return",
        "fi",
        "",
        'case "$command" in',
        ...exports.COMMAND_COMPLETION_SPECS.map((entry) => renderZshCase(entry)),
        "esac",
    ].join("\n");
};
const renderFishOptionValueCompletion = (entry) => {
    const lines = [];
    for (const option of entry.options) {
        if (option.valueChoices && option.valueChoices.length > 0) {
            lines.push(`complete -c ilu -n ${quoteJson(`__fish_seen_subcommand_from ${entry.name}; and __ilu_prev_arg_in ${option.flag}`)} -a ${quoteJson(option.valueChoices.join(" "))}`);
            continue;
        }
        if (option.isFilesystemPath) {
            lines.push(`complete -c ilu -n ${quoteJson(`__fish_seen_subcommand_from ${entry.name}; and __ilu_prev_arg_in ${option.flag}`)} -a '(__fish_complete_path)'`);
        }
    }
    return lines;
};
const renderFishCompletion = () => {
    const lines = [
        "function __ilu_prev_arg_in",
        "    set -l tokens (commandline -opc)",
        "    set -l current (commandline -ct)",
        "    if test -n \"$current\"",
        "        set -e tokens[-1]",
        "    end",
        "    if test (count $tokens) -eq 0",
        "        return 1",
        "    end",
        "    contains -- $tokens[-1] $argv",
        "end",
        "",
        "complete -c ilu -f",
        ...TOP_LEVEL_SPECS.map((entry) => `complete -c ilu -n '__fish_use_subcommand' -a ${quoteJson(entry.name)} -d ${quoteJson(entry.summary)}`),
        ...HELP_TOPIC_SPECS.map((entry) => `complete -c ilu -n '__fish_seen_subcommand_from help' -a ${quoteJson(entry.name)} -d ${quoteJson(entry.summary)}`),
        `complete -c ilu -n '__fish_seen_subcommand_from completion' -a ${quoteJson(exports.COMPLETION_SHELLS.join(" "))}`,
        `complete -c ilu -n '__fish_seen_subcommand_from doctor' -l json -d ${quoteJson("emit machine-readable diagnostics")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from doctor' -l help -d ${quoteJson("show doctor help")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from bug-report' -l out -r -d ${quoteJson("output directory")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from bug-report' -l urdf -r -d ${quoteJson("attach a local URDF file")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from bug-report' -l source -r -d ${quoteJson("attach a local source file or directory")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from bug-report' -l help -d ${quoteJson("show bug-report help")}`,
        `complete -c ilu -n '__fish_seen_subcommand_from bug-report; and __ilu_prev_arg_in --out --urdf --source' -a '(__fish_complete_path)'`,
    ];
    for (const entry of exports.COMMAND_COMPLETION_SPECS) {
        for (const option of entry.options) {
            const description = option.valueHint ?? "option";
            const requiresArgument = option.valueHint ? " -r" : "";
            lines.push(`complete -c ilu -n ${quoteJson(`__fish_seen_subcommand_from ${entry.name}`)} -l ${option.flag.slice(2)}${requiresArgument} -d ${quoteJson(description)}`);
        }
        lines.push(...renderFishOptionValueCompletion(entry));
    }
    return lines.join("\n");
};
const isCompletionShell = (value) => COMPLETION_SHELL_SET.has(value);
exports.isCompletionShell = isCompletionShell;
const renderCompletionHelp = () => {
    return [
        "Generate shell completion scripts.",
        "",
        "Usage",
        "  ilu completion <bash|zsh|fish>",
        "",
        "Examples",
        "  source <(ilu completion bash)",
        "  source <(ilu completion zsh)",
        "  ilu completion fish > ~/.config/fish/completions/ilu.fish",
    ].join("\n");
};
exports.renderCompletionHelp = renderCompletionHelp;
const renderCompletionScript = (shell) => {
    switch (shell) {
        case "bash":
            return renderBashCompletion();
        case "zsh":
            return renderZshCompletion();
        case "fish":
            return renderFishCompletion();
    }
};
exports.renderCompletionScript = renderCompletionScript;
