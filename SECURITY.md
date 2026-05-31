# Security policy

We take the security of BRAINS code and the people who use it seriously. If you find a vulnerability, we want to hear from you and we will work with you to fix it.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately using GitHub Security Advisories:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Fill in the details. We will respond within five business days.

If you cannot use GitHub Security Advisories, email **security@brainscertified.com** with the details. Encrypt with our PGP key if the content is sensitive (key on request).

## What to include

- A clear description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected version or commit SHA if you know it.
- Your preferred name and contact for credit, or a request to stay anonymous.

## What we promise

- We will acknowledge your report within five business days.
- We will keep you informed as we investigate and fix.
- We will credit you in the release notes unless you ask us not to.
- We will not take legal action against good-faith research that follows this policy.

## Scope

In scope: code in this repository, its CI configuration, and its published artefacts.

Out of scope: third-party services we link to, vulnerabilities in upstream dependencies (please report those upstream and notify us), and findings that require physical access to a contributor's machine.

## Supply chain

This repo runs OpenSSF Scorecard, CodeQL, Trivy, Gitleaks, and Dependabot on every push and pull request. Releases (where applicable) are signed.
