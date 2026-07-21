# Security Policy

## Supported versions

This project is pre-1.0 and under active development. While 0.x is in effect, only the `master` branch receives security fixes. Pin to a specific commit if your setup has stricter requirements.

Once 1.0.0 is released, this section will be updated with a supported-versions table.

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Use one of these private channels:

1. **GitHub private vulnerability reporting** (preferred) — submit a report via the repository's [Security tab](https://github.com/NextDoorDevLab/slack_mcp/security/advisories/new).
2. **Email** — send details to [Tolu T.](mailto:tolu@nextdoordev.nl).

Please include:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof-of-concept
- Affected versions, if known
- Any suggested mitigations

## Response timeline

- Acknowledgement within **72 hours** of receipt
- Initial assessment and severity classification within **7 days**
- For confirmed issues, a target fix date is communicated, after which we coordinate public disclosure (typically a GitHub Security Advisory paired with a release)

## Scope

**In scope:** the code in this repository and its direct configuration surface — the MCP server itself, the `authorize` OAuth flow, and the local config/cache file handling under `~/.slack-mcp/`.

**Out of scope:** vulnerabilities in upstream dependencies (please report those to the respective project — `@slack/web-api`, the Model Context Protocol SDK, `open`, etc.), and operational misconfiguration on the machine running the server (e.g. a shared multi-user machine where `~/.slack-mcp/`'s owner-only file permissions are relied on but the OS/filesystem doesn't actually enforce them).

## This project's specific risk model

`slack_mcp` runs locally with real reach into a Slack workspace — see the README's [Security considerations](README.md#security-considerations) section for the operational risk model (the upload denylist, local token/cache handling, auto-reply rate limiting, and the Socket Mode daemon's token-burn risk). That section is the right place to check before reporting something as a vulnerability versus a configuration choice.
