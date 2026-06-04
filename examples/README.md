# Hoolix Examples

These examples show common Hoolix workflows you can copy into demos, tests, or team docs.

## TUI-First Trial

```bash
hoolix
hoolix trial
hoolix verify hoolix-trial
hoolix connect hoolix-trial --client cursor
```

## Single Source

```bash
hoolix create "React Docs" --url https://react.dev/llms.txt --yes
hoolix verify react-docs
hoolix start react-docs
```

## Multi-Source

```bash
hoolix create "Frontend Stack" \
  --source docs:https://react.dev/llms.txt \
  --source github:vercel/next.js \
  --yes
```

## Template

```bash
hoolix templates list
hoolix create "Terraform AWS" --template terraform-aws-docs --yes
```

## Private Source

```bash
hoolix create "Private Docs" \
  --url https://docs.example.com/llms.txt \
  --header "Authorization: Bearer $DOCS_TOKEN" \
  --cookie "session=$DOCS_SESSION" \
  --yes
```

## Team Bundle

```bash
hoolix export frontend-stack --team --strip-key --file frontend-stack.hoolix.json
hoolix import --file frontend-stack.hoolix.json --slug frontend-stack-copy --yes
```

## Source Plugin Manifest

See [source-plugin-handbook.json](./source-plugin-handbook.json) for a minimal custom source provider manifest.

```bash
set HOOLIX_SOURCE_PLUGIN_DIR=%CD%\examples
hoolix create "Handbook" --source custom:handbook:getting-started --yes
```

On macOS/Linux:

```bash
HOOLIX_SOURCE_PLUGIN_DIR=$PWD/examples hoolix create "Handbook" --source custom:handbook:getting-started --yes
```
