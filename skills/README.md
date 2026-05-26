# Claude Code Skills

These skills teach Claude how to work with JSCAD models and the jscad-mcp server. Install them so Claude automatically uses the right workflow when you're doing 3D CAD work.

## Skills included

| Skill | Description |
|-------|-------------|
| `jscad-mcp` | Core workflow: render → describe → compare → fix loop. Required for using the MCP server effectively. |
| `jscad` | Code authoring reference: primitives, transforms, booleans, extrusions, parametric UI. |
| `jscad-wiki` | Full API documentation for `@jscad/modeling`. |
| `jscad-examples` | Real-world patterns from working designs (gears, threads, hinges, etc.). |

## Installation

Copy skill directories into your Claude Code skills folder:

```bash
# Default location (Claude Code CLI)
SKILLS_DIR="$HOME/.claude/skills"

mkdir -p "$SKILLS_DIR"
cp -r skills/jscad-mcp   "$SKILLS_DIR/"
cp -r skills/jscad        "$SKILLS_DIR/"
cp -r skills/jscad-wiki   "$SKILLS_DIR/"
cp -r skills/jscad-examples "$SKILLS_DIR/"
```

After copying, skills activate automatically when Claude detects JSCAD-related work.

## Minimum install

If you only want the core MCP workflow skill:

```bash
cp -r skills/jscad-mcp "$HOME/.claude/skills/"
```
