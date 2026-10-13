---
name: code-review
description: Comprehensive, read-only code review skill for analyzing entire codebases or explicitly mentioned files. Use when asked to review code for logic bugs, type errors, security issues, performance problems, regressions, maintainability risks, or other user-specified focus areas. Prioritize a thorough, evidence-based report with file references and never modify code while reviewing.
---

# Code Review

## Overview

Perform deep, read-only code reviews. Check all files in scope, prioritize real issues over style nitpicks, and produce a structured report with clear evidence and impact.

## Non-Negotiable Rules

- Never modify code during review.
- Never create, delete, or rewrite project files as part of review output.
- Treat user focus areas as mandatory priorities.
- If user asks for full-codebase review, inspect every file in the repository that can affect behavior.
- If user names specific files, inspect all named files completely.
- Do not claim a file was reviewed unless it was actually opened and analyzed.

## Review Workflow

### 1. Define Scope

- Determine whether scope is entire codebase or specific files.
- Expand scope to directly related files when needed to validate behavior.
- Record scope boundaries in the final report.

### 2. Build File Inventory

- Enumerate files in scope before analysis.
- Group files by area (runtime code, config, infra, tests, schemas, migrations, scripts).
- Do not sample when full coverage is requested.

### 3. Analyze Every In-Scope File

For each file, check at minimum:

- Logic correctness and edge cases
- Type safety and type drift risks
- Security vulnerabilities and unsafe trust boundaries
- Performance bottlenecks and unnecessary work
- Reliability issues (error handling, retries, race conditions, resource leaks)
- Regression risk from implicit assumptions or fragile coupling

If user requests extra focus (for example accessibility, API consistency, architecture), include it as a first-class review axis.

### 4. Validate Findings Quality

- Report only issues with concrete evidence.
- Prefer high-signal findings over speculative comments.
- If uncertain, explicitly mark uncertainty and what would confirm it.
- Distinguish bugs from improvements.

### 5. Produce Final Report

Order findings by severity:

1. Critical
2. High
3. Medium
4. Low

For each finding include:

- Severity
- File and line reference
- What is wrong
- Why it matters (impact)
- Minimal recommended fix direction

Then include:

- Scope summary (what was reviewed)
- Areas with no issues found
- Open questions or assumptions
- Residual risk or testing gaps

## Reporting Standards

- Be precise and concise.
- Use direct file references for every non-trivial claim.
- Avoid generic advice without evidence.
- Prefer actionable remediation guidance.
- If no issues are found, state that explicitly and list residual risks.

## Reviewer Mindset

- Think like an attacker for security paths.
- Think like production traffic for performance paths.
- Think like future maintainers for reliability and clarity.
- Focus on behavior and risk, not personal style preferences.
