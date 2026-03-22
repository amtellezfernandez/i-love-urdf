# i-love-urdf

Interactive URDF shell.

```sh
npm install -g --install-links=true git+https://github.com/amtellezfernandez/i-love-urdf.git
ilu
```

Inside `ilu`:

- paste `owner/repo` or drop a local folder, `.urdf`, or `.zip`
- `ilu` auto-runs validation and a health check when it can
- if there are multiple matches, use arrow keys and `Enter` to pick one
- if XACRO runtime is missing, run `!xacro`
- type `/` only when you want extra helpers
- use arrow keys to move
- press `Tab` to complete the selected option
- press `Enter` to select
- press `Ctrl+C` to exit

Update:

```sh
ilu update
```

Uninstall:

```sh
npm uninstall -g i-love-urdf
```
