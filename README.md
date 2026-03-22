# i-love-urdf

Interactive URDF CLI.

The main way to use it is:

```sh
ilu
```

That opens the interactive shell.

## Install

```sh
npm install -g --install-links=true git+https://github.com/amtellezfernandez/i-love-urdf.git
ilu
```

## Use

Inside the shell:

- type `/` to see helpers
- start with `/load-source`
- then choose `/local` or `/repo`
- when the shell says `[ready] /run`, type `/run`

`/repo` accepts:

- `owner/repo`
- `github.com/owner/repo`
- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`

Typical flow:

```text
ilu
/load-source
/local
./robot.urdf
/run
/health-check
/run
```

## Update

```sh
ilu update
```

## Uninstall

```sh
npm uninstall -g i-love-urdf
```

## Completion

```sh
source <(ilu completion bash)
source <(ilu completion zsh)
ilu completion fish > ~/.config/fish/completions/ilu.fish
```

## GitHub Auth

```sh
gh auth login
```

## License

Source-available; not open source.
See [LICENSE](/home/am/dev/i-love-urdf/LICENSE).
