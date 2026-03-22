import { CLI_HELP_SECTIONS, COMMAND_CATALOG, SUPPORTED_COMMANDS, type SupportedCommandName } from "./commandCatalog";

export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export type CompletionOptionSpec = {
  flag: `--${string}`;
  valueHint?: string;
  valueChoices?: readonly string[];
  isFilesystemPath?: boolean;
};

export type CompletionCommandSpec = {
  name: SupportedCommandName;
  summary: string;
  options: readonly CompletionOptionSpec[];
  requiredAlternatives: readonly (readonly string[])[];
};

type CompletionTopLevelSpec = {
  name: string;
  summary: string;
};

const COMPLETION_SHELL_SET = new Set<string>(COMPLETION_SHELLS);
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
} as const satisfies Record<string, readonly string[]>;

const getCommandSummary = (commandName: SupportedCommandName): string => {
  const section = CLI_HELP_SECTIONS.find((entry) => entry.commands.includes(commandName));
  return section?.summary ?? section?.title ?? "CLI command";
};

const tokenizeUsageSyntax = (usageLine: string): string[] => {
  const tokens: string[] = [];
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

const normalizeValueHint = (token: string): string => {
  if (
    (token.startsWith("<") && token.endsWith(">")) ||
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }

  return token;
};

const getOptionValueToken = (tokens: readonly string[], index: number): string | undefined => {
  const nextToken = tokens[index + 1];
  if (!nextToken || nextToken === "[" || nextToken === "]" || nextToken === "|" || nextToken.startsWith("--")) {
    return undefined;
  }
  return nextToken;
};

const isFilesystemOption = (flagKey: string, valueHint?: string): boolean => {
  if (FILESYSTEM_FLAG_KEYS.has(flagKey)) {
    return true;
  }

  if (valueHint && FILESYSTEM_HINT_PATTERN.test(valueHint)) {
    return true;
  }

  return FILESYSTEM_HINT_PATTERN.test(flagKey);
};

const deriveOptionSpecs = (commandName: SupportedCommandName): CompletionOptionSpec[] => {
  const optionByFlag = new Map<string, CompletionOptionSpec>();

  for (const usageLine of COMMAND_CATALOG[commandName].usage) {
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
      const nextSpec: CompletionOptionSpec = existing
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

const deriveRequiredAlternatives = (commandName: SupportedCommandName): readonly (readonly string[])[] => {
  const alternatives: string[][] = [];
  const seen = new Set<string>();

  for (const usageLine of COMMAND_CATALOG[commandName].usage) {
    const tokens = tokenizeUsageSyntax(usageLine).slice(1);
    let optionalDepth = 0;
    let currentAlternative: string[] = [];

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

export const COMMAND_COMPLETION_SPECS: readonly CompletionCommandSpec[] = SUPPORTED_COMMANDS.map(
  (commandName) => ({
    name: commandName,
    summary: getCommandSummary(commandName),
    options: deriveOptionSpecs(commandName),
    requiredAlternatives: deriveRequiredAlternatives(commandName),
  })
);

export const COMMAND_COMPLETION_SPEC_BY_NAME: Readonly<
  Record<SupportedCommandName, CompletionCommandSpec>
> = Object.fromEntries(
  COMMAND_COMPLETION_SPECS.map((entry) => [entry.name, entry])
) as Record<SupportedCommandName, CompletionCommandSpec>;

const TOP_LEVEL_SPECS: readonly CompletionTopLevelSpec[] = [
  { name: "help", summary: "Show CLI help." },
  { name: "update", summary: "Update ilu to the latest version from GitHub." },
  { name: "shell", summary: "Start the interactive slash-command shell." },
  { name: "completion", summary: "Generate shell completion scripts." },
  ...COMMAND_COMPLETION_SPECS.map((entry) => ({
    name: entry.name,
    summary: entry.summary,
  })),
];

const HELP_TOPIC_SPECS: readonly CompletionTopLevelSpec[] = [
  { name: "update", summary: "Update ilu to the latest version from GitHub." },
  { name: "shell", summary: "Start the interactive slash-command shell." },
  { name: "completion", summary: "Generate shell completion scripts." },
  ...COMMAND_COMPLETION_SPECS.map((entry) => ({
    name: entry.name,
    summary: entry.summary,
  })),
];

const quoteJson = (value: string): string => JSON.stringify(value);

const renderWordList = (values: readonly string[]): string => quoteJson(values.join(" "));

const renderBashCase = (entry: CompletionCommandSpec): string => {
  const optionWords = entry.options.map((option) => option.flag);
  const optionCases: string[] = [];

  for (const option of entry.options) {
    if (option.valueChoices && option.valueChoices.length > 0) {
      optionCases.push(
        `        ${option.flag}) COMPREPLY=( $(compgen -W ${renderWordList(option.valueChoices)} -- "$cur") ); return 0 ;;`
      );
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
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const renderBashCompletion = (): string => {
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
    `      COMPREPLY=( $(compgen -W ${renderWordList(COMPLETION_SHELLS)} -- "$cur") )`,
    "    fi",
    "    return 0",
    "  fi",
    "",
    '  command="${COMP_WORDS[1]}"',
    '  case "$command" in',
    ...COMMAND_COMPLETION_SPECS.map((entry) => renderBashCase(entry)),
    "  esac",
    "}",
    "",
    "complete -o bashdefault -o default -F _ilu ilu",
  ].join("\n");
};

const renderZshCommandItems = (entries: readonly CompletionTopLevelSpec[]): string =>
  entries.map((entry) => `  ${quoteJson(`${entry.name}:${entry.summary}`)}`).join("\n");

const renderZshOptionItems = (entry: CompletionCommandSpec): string =>
  entry.options
    .map((option) => {
      const description = option.valueHint ?? "option";
      return `  ${quoteJson(`${option.flag}[${description}]`)}`;
    })
    .join("\n");

const renderZshPreviousValueCases = (entry: CompletionCommandSpec): string[] => {
  const valueCases: string[] = [];

  for (const option of entry.options) {
    if (option.valueChoices && option.valueChoices.length > 0) {
      valueCases.push(
        `      ${option.flag})\n        _values ${quoteJson(option.valueHint ?? option.flag)} ${option.valueChoices.map((value) => quoteJson(value)).join(" ")}\n        return\n        ;;`
      );
      continue;
    }

    if (option.isFilesystemPath) {
      valueCases.push(`      ${option.flag})\n        _files\n        return\n        ;;`);
    }
  }

  return valueCases;
};

const renderZshCase = (entry: CompletionCommandSpec): string => {
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
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const renderZshCompletion = (): string => {
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
    ...COMPLETION_SHELLS.map((shell) => `      ${quoteJson(`${shell}:${shell} completion script`)}`),
    "    )",
    "    _describe -t shells 'shell' shells",
    "  fi",
    "  return",
    "fi",
    "",
    'case "$command" in',
    ...COMMAND_COMPLETION_SPECS.map((entry) => renderZshCase(entry)),
    "esac",
  ].join("\n");
};

const renderFishOptionValueCompletion = (entry: CompletionCommandSpec): string[] => {
  const lines: string[] = [];

  for (const option of entry.options) {
    if (option.valueChoices && option.valueChoices.length > 0) {
      lines.push(
        `complete -c ilu -n ${quoteJson(
          `__fish_seen_subcommand_from ${entry.name}; and __ilu_prev_arg_in ${option.flag}`
        )} -a ${quoteJson(option.valueChoices.join(" "))}`
      );
      continue;
    }

    if (option.isFilesystemPath) {
      lines.push(
        `complete -c ilu -n ${quoteJson(
          `__fish_seen_subcommand_from ${entry.name}; and __ilu_prev_arg_in ${option.flag}`
        )} -a '(__fish_complete_path)'`
      );
    }
  }

  return lines;
};

const renderFishCompletion = (): string => {
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
    ...TOP_LEVEL_SPECS.map(
      (entry) =>
        `complete -c ilu -n '__fish_use_subcommand' -a ${quoteJson(entry.name)} -d ${quoteJson(
          entry.summary
        )}`
    ),
    ...HELP_TOPIC_SPECS.map(
      (entry) =>
        `complete -c ilu -n '__fish_seen_subcommand_from help' -a ${quoteJson(entry.name)} -d ${quoteJson(
          entry.summary
        )}`
    ),
    `complete -c ilu -n '__fish_seen_subcommand_from completion' -a ${quoteJson(COMPLETION_SHELLS.join(" "))}`,
  ];

  for (const entry of COMMAND_COMPLETION_SPECS) {
    for (const option of entry.options) {
      const description = option.valueHint ?? "option";
      const requiresArgument = option.valueHint ? " -r" : "";
      lines.push(
        `complete -c ilu -n ${quoteJson(`__fish_seen_subcommand_from ${entry.name}`)} -l ${option.flag.slice(2)}${requiresArgument} -d ${quoteJson(description)}`
      );
    }

    lines.push(...renderFishOptionValueCompletion(entry));
  }

  return lines.join("\n");
};

export const isCompletionShell = (value: string): value is CompletionShell =>
  COMPLETION_SHELL_SET.has(value);

export const renderCompletionHelp = (): string => {
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

export const renderCompletionScript = (shell: CompletionShell): string => {
  switch (shell) {
    case "bash":
      return renderBashCompletion();
    case "zsh":
      return renderZshCompletion();
    case "fish":
      return renderFishCompletion();
  }
};
