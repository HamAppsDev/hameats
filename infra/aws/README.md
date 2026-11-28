# HamEats on AWS

> The move from Vercel and Neon was finished on 2026-11-25: hameats.app is served by this stack, favorites were
> copied into DynamoDB, and the Vercel project is gone. Steps 1–6 below are kept as the record of how it was set up
> (and how to rebuild it from scratch); the old Neon copy step has been removed along with its script.

HamEats runs on AWS Lambda behind CloudFront, with favorites in DynamoDB. Everything is sized to stay inside AWS's
**always-free** allowances (not the 12-month trial ones), so at HamEats's traffic the bill should be $0. AWS doesn't
promise that, though: it charges for anything past the free limits. The project's existing "Zero spend" budget emails
you the moment anything costs even one cent.

```
visitor ─▶ CloudFront (hameats.app, HTTPS) ─▶ Lambda function URL ─▶ Next.js (web/lambda/index.mjs)
                                                                        └▶ DynamoDB: hameats-users
EventBridge Scheduler, 8:00 America/New_York ─▶ the same function ─▶ push notifications
GitHub Actions, every push to main ─▶ builds web/ ─▶ replaces the function's code
```

| Piece | What it does | Always-free allowance | HamEats uses |
|---|---|---|---|
| Lambda | Runs the app | 1M requests + 400,000 GB-seconds a month | a few thousand requests |
| CloudFront | HTTPS, your domain, caches static files | 1 TB + 10M requests a month | well under 1 GB |
| CloudFront Functions | Passes on the address the visitor used | 2M a month | one per page request |
| DynamoDB | Favorites and notification settings | 25 GB, 25 reads/s and 25 writes/s (provisioned) | 5/5, a few KB |
| Parameter Store | Secrets (standard parameters) | free | 8 settings |
| EventBridge Scheduler | The daily alerts, run every 15 minutes | 14M a month | about 2,900 a month |
| SES | Alert emails, from notifications@hameats.app (stack parameter EmailAlerts turns them on) | none: $0.10 per 1,000 emails | a few cents a month at most |
| CloudWatch Logs | The app's logs, kept 14 days | 5 GB a month | small |

Things the setup avoids because they cost money: a load balancer, Route 53 hosted zones ($0.50/month), Secrets
Manager ($0.40 per secret), NAT gateways, and on-demand DynamoDB (billed per request).

The one trade-off: Lambda only runs when someone visits, so the first visit after a quiet spell takes about a second
longer while it starts. The app's own offline copy (the service worker) hides most of that on phones that have it
installed.

## What you need

- The AWS CLI signed in to the HamApps project: `aws login --profile hamapps` (Region **us-east-2**). Every command
  below uses `--profile hamapps --region us-east-2`. The project only allows Regional resources in us-east-2; the one
  exception is the hameats.app certificate (step 5), which CloudFront requires in us-east-1.
- The values of your current Vercel settings (Vercel → Project → Settings → Environment Variables).
- Access to where hameats.app's DNS is managed (your registrar, or Vercel if its nameservers point there).

## 1. Put the secrets in Parameter Store

Copy each value from Vercel. Keeping `AUTH_SECRET` the same keeps everyone logged in, and keeping the VAPID keys the
same keeps everyone's notifications working.

```sh
put() { aws ssm put-parameter --profile hamapps --region us-east-2 --name "/hameats/$1" --type SecureString --overwrite --value "$2"; }
put AUTH_SECRET        'value from Vercel'
put AUTH_GOOGLE_ID     'value from Vercel'
put AUTH_GOOGLE_SECRET 'value from Vercel'
put VAPID_PRIVATE_KEY  'value from Vercel'
put CRON_SECRET        "$(openssl rand -hex 24)"
put STATUS_KEY         "$(openssl rand -hex 24)"   # or the value from Vercel
put TEST_LOGIN_SECRET  'value from Vercel'          # or: off
# Not a secret, but CloudFront reads it, so it's a plain String:
aws ssm put-parameter --profile hamapps --region us-east-2 --name /hameats/ORIGIN_VERIFY --type String --overwrite --value "$(openssl rand -hex 24)"
# Optional: other schools' Google Workspace domains that may also log in, comma-separated. Unset = Hamilton only.
aws ssm put-parameter --profile hamapps --region us-east-2 --name /hameats/EXTRA_LOGIN_DOMAINS --type String --overwrite --value "stanford.edu"
```

## 2. Create everything

From the repository's root folder:

```sh
aws cloudformation deploy --profile hamapps --region us-east-2 --stack-name hameats \
  --template-file infra/aws/hameats.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides VapidPublicKey='NEXT_PUBLIC_VAPID_PUBLIC_KEY from Vercel'
aws cloudformation describe-stacks --profile hamapps --region us-east-2 --stack-name hameats --query 'Stacks[0].Outputs' --output table
```

Add `CreateTable=false` if you already made the `hameats-users` table by hand, and `CreateGitHubOidcProvider=false`
if the account already has GitHub's identity provider (the deploy says so if it does). Keep the outputs: you need
`DeployRoleArn`, `SiteUrl` and `CloudFrontDomain` below.

## 3. Let GitHub deploy

In GitHub: the repository → Settings → Secrets and variables → Actions → **Variables** tab. Add:

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` from step 2 |
| `AWS_REGION` | `us-east-2` |
| `SITE_URL` | `SiteUrl` from step 2 (later: `https://www.hameats.app`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from Vercel |
| `NEXT_PUBLIC_POSTHOG_KEY` | from Vercel |
| `NEXT_PUBLIC_POSTHOG_HOST` | from Vercel (or leave out) |

These are all public values; nothing secret goes in GitHub.

**Before the next push to main, stop Vercel deploying it** (Vercel → Project → Settings → Git → Disconnect). The
new code no longer uses Neon, so a Vercel deploy without the AWS settings would switch favorites off on the live
site. With Git disconnected, Vercel keeps serving the current version until the domain moves.

Then push to main (or run the "Deploy to AWS" workflow from the Actions tab). It builds the app, replaces the
Lambda code and checks that `SITE_URL/api/version` reports the new commit.

## 4. Try it on the CloudFront address

Open `SiteUrl`. The menus, hours, search and favorites should all work. To try logging in there too, add
`https://<CloudFrontDomain>/api/auth/callback/google` to the Google OAuth client's authorized redirect URIs
(console.cloud.google.com → APIs & Services → Credentials), and remove it again afterwards.

To try the alerts without waiting: AWS console → Lambda → hameats → Test, with the event
`{"hameats":"alerts"}`. When nobody's picked time has just come it answers `{"due":0}`, which means it worked.

## 5. Get a certificate for hameats.app

AWS console, region us-east-1 (CloudFront only accepts certificates from there) → Certificate Manager → Request → public certificate for `www.hameats.app` and
`hameats.app`, DNS validation. Add the two CNAME records it shows at your DNS provider and wait until it says
Issued (minutes to an hour). Then:

```sh
aws cloudformation deploy --profile hamapps --region us-east-2 --stack-name hameats \
  --template-file infra/aws/hameats.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides CertificateArn=arn:aws:acm:us-east-1:...:certificate/... \
  --no-fail-on-empty-changeset
```

(Parameters you set before keep their values.)

## 6. Move the domain

At your DNS provider:

- `www.hameats.app`: CNAME to `CloudFrontDomain`.
- `hameats.app`: an ALIAS/ANAME/flattened CNAME to `CloudFrontDomain` if your provider offers one; otherwise a
  redirect to `https://www.hameats.app`.

If the nameservers point at Vercel, move DNS to your registrar first, copying any other records (mail, etc.).
Route 53 also works, but its hosted zone costs $0.50/month.

Then change the GitHub variable `SITE_URL` to `https://www.hameats.app`. Phones keep their notifications and logins,
because the address and keys haven't changed.

## Deleting someone's account

AWS console → DynamoDB → Tables → hameats-users → Explore items → find their email → Delete.

## If something goes wrong

- **Logs**: AWS console → CloudWatch → Log groups → `/aws/lambda/hameats`.
- **Roll back the code**: GitHub → Actions → "Deploy to AWS" → open an older successful run → Re-run jobs.
