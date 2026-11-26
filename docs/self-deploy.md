# Running your own copy: sign-in settings

[Русская версия](self-deploy.ru.md)

These notes are for anyone who deploys Radavod to their own Cloudflare account. A full guide comes later; this page covers the three settings sign-in needs. Without them nobody can sign in and nobody can set the family up.

The examples use `family.example` as the address of the site. Use your own.

## The settings

| Setting      | Kind     | Value                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------- |
| `RP_ID`      | variable | The domain of the site, without `https://`, port or path: `family.example` |
| `ORIGIN`     | variable | The address exactly as a browser sends it: `https://family.example`        |
| `SETUP_CODE` | secret   | A long random code that lets a keeper set the family up                    |

`RP_ID` and `ORIGIN` go into `vars` of the Wrangler configuration of your installation, next to `JURISDICTION` and `SAMPLE`. `ORIGIN` has no trailing slash and no port. The site must be served over `https://` from that domain; a `*.workers.dev` address or a second domain will not sign anyone in.

A deploy replaces every variable with what the configuration says, so a variable set only in the Cloudflare dashboard is lost at the next deploy. Keep both in the configuration.

Passkeys belong to `RP_ID`. If you move the site to another domain later, every passkey made for the old one stops working there, and each member has to be let in again. Choose the domain before the first keeper signs in.

## The setup code

`SETUP_CODE` is a Worker secret, never a variable: a variable is visible to anyone who can read the Worker's settings.

What it does:

- On a new installation it lets the first keeper in, on the page `/setup`.
- After that, each new code lets in one more keeper, once. A code that has been used lets nobody in again, so it is safe to leave it in place.
- A missing code, or one shorter than 20 characters, keeps setup closed. Members still sign in as usual.
- The setup page allows 10 attempts per 15 minutes from one address. A wrong code, a used one and no code at all get the same answer.

The usual way to add members is an invitation from a keeper. The setup code is for the first keeper, and for one more keeper when no keeper can send an invitation.

### Making a strong code

Use 32 random characters from a password manager's generator, and save the code there: you will type it on the setup page. Do not make one up, and do not reuse a password.

Without a password manager, either of these prints a 32-character random code (the second needs PowerShell 7):

```sh
openssl rand -base64 24
```

```powershell
$bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24); [Convert]::ToBase64String($bytes)
```

Keep the code out of files in the repository, `.env` and `.dev.vars` files you commit, issues, chats and screenshots.

### Putting the code on the Worker

```sh
npx wrangler secret put SETUP_CODE
```

Wrangler asks for the value without showing it. The secret takes effect at once and stays across deploys. To let one more keeper in, put a new code the same way and give it to that person through a channel only the two of you read.

If you deploy from CI, store the code as a secret of the CI system and pass it to `wrangler deploy --secrets-file` through a temporary file, or to `wrangler secret put` through standard input. Never put it on a command line or print it in the log.

## Local development

Tests and `wrangler dev` run with `RP_ID` set to `localhost` and `ORIGIN` set to the local address, for example `http://localhost:8787`. Browsers accept passkeys on `localhost` without `https://`. The tests set their own setup code; any code of 20 characters or more works locally.
