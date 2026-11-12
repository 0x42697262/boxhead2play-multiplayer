# Amazon ECS (Fargate) with a Cloudflare Tunnel

One Fargate task runs two containers:

| Container | Image | What it does |
|---|---|---|
| `boxhead2play` | this repository's `Dockerfile`, built for `linux/arm64` and pushed to ECR | The game server on `127.0.0.1:8080`. |
| `cloudflared` | `cloudflare/cloudflared` | Opens an outbound tunnel to Cloudflare and forwards the public hostname to `http://localhost:8080`. |

Containers in an `awsvpc` task share one network namespace, so `cloudflared` reaches the game on
`localhost` while the game listens on loopback only. Nothing listens on the task's public
address and the security group has no inbound rules.

## Why a tunnel and not a load balancer

A Fargate task gets a new public IP on every start and has nothing in front of it to
terminate TLS. Browsers on the `https` page only open `wss://`, so the game needs TLS. An
Application Load Balancer gives a stable name and TLS but costs more than the task itself. The
tunnel connects outward, so the changing IP does not matter, and Cloudflare terminates TLS and
proxies WebSocket upgrades. The domain's DNS must be on Cloudflare.

## Constraints

* **Exactly one task.** Lobbies live in server memory. Two tasks would mean two sets of
  lobbies, and Cloudflare balances between tunnel connectors, so players would be split at
  random. Keep `desiredCount` at 1 and do not add auto scaling.
* **Deploys stop the old task first.** The service uses `minimumHealthyPercent: 0` and
  `maximumPercent: 100`, so two tasks never run at once. A deploy drops every connection
  and empties every lobby, the same as a restart on any other host.
* **Client addresses.** Cloudflare puts the client address last in `X-Forwarded-For`, which
  is the entry the server reads with `BOXHEAD_TRUST_PROXY=true`. The per-address limits in
  `docs/runtime/online.md` depend on it.
* **Idle connections.** Cloudflare closes a WebSocket after about 100 seconds without traffic.
  The server pings every `PING_INTERVAL_MS` (`src/server/tuning.ts`, 20 seconds), well
  within that.

## Files

* `deploy/ecs/task-definition.json`: the task definition template. `${ACCOUNT_ID}` and
  `${AWS_REGION}` are filled in once with `envsubst` when registering the first revision.
* `.github/workflows/ecs.yml`: on every push to `main` (and on manual dispatch) it builds the
  image on an arm64 runner, pushes it to ECR tagged with the commit SHA, takes the service's
  current task definition, swaps in the new image and deploys it. The job is skipped until
  the repository variable `AWS_ROLE_ARN` is set, so forks and an unconfigured repository do
  not fail. Changes to the task definition other than the image (CPU, memory, environment,
  secrets) are registered by hand and the next deploy carries them forward.

The workflow signs in to AWS with GitHub's OIDC provider. No AWS keys are stored in GitHub.

## What is public

The repository and its Actions logs are public. Nothing in the repository identifies the AWS
account: the template uses `${ACCOUNT_ID}` and `${AWS_REGION}` placeholders, and the tokens
live in SSM Parameter Store as `SecureString`. The workflow sets `mask-aws-account-id`, so the
account ID in the role ARN, the ECR registry and the image reference is replaced with `***` in
the logs. Repository variables are visible only to collaborators. The trust policy accepts
only workflow runs on `main` of this repository, and the workflow does not run on pull
requests, so a fork or a pull request cannot assume the deploy role.

## One-time setup

The commands assume:

```sh
export AWS_REGION=ap-southeast-2
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REPO=0x42697262/boxhead2play-multiplayer
export SUB_PREFIX=$(gh api repos/$REPO/actions/oidc/customization/sub --jq .sub_claim_prefix)
```

### 1. Cloudflare tunnel

In the Cloudflare dashboard: Zero Trust, Networks, Tunnels, create a `cloudflared` tunnel
named `boxhead2play` and copy its token. Add a public hostname (for example
`boxhead.example.com`) with service type `HTTP` and URL `localhost:8080`. Remove any existing
DNS record for that hostname first; the tunnel creates its own `CNAME`.

### 2. Secrets in SSM Parameter Store

```sh
aws ssm put-parameter --name /boxhead2play/tunnel-token --type SecureString --value '<tunnel token>'
aws ssm put-parameter --name /boxhead2play/monitor-token --type SecureString --value "$(openssl rand -hex 24)"
```

### 3. ECR repository and cluster

```sh
aws ecr create-repository --repository-name boxhead2play
aws ecr put-lifecycle-policy --repository-name boxhead2play --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}'
aws ecs create-cluster --cluster-name boxhead2play
aws logs create-log-group --log-group-name /ecs/boxhead2play
aws logs put-retention-policy --log-group-name /ecs/boxhead2play --retention-in-days 14
```

The server logs client addresses, which are personal data, so the log group is created
up front with a retention period instead of letting ECS create one that never expires.

### 4. Task execution role

ECS uses this role to pull the image, read the two parameters and write logs.

```sh
aws iam create-role --role-name boxhead2play-ecs-execution --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name boxhead2play-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name boxhead2play-ecs-execution --policy-name secrets-and-logs --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"ssm:GetParameters\",
     \"Resource\": \"arn:aws:ssm:${AWS_REGION}:${ACCOUNT_ID}:parameter/boxhead2play/*\"}
  ]
}"
```

### 5. Deploy role for GitHub Actions

Create the OIDC provider once per account (skip it if it already exists):

```sh
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

The role trusts only runs on `main` of this repository. The repository uses GitHub's
immutable OIDC subject, which names the owner and repository by ID as well as by name
(`repo:<owner>@<owner id>/<repo>@<repo id>`), so a renamed or recreated repository with
the same name cannot assume the role. `SUB_PREFIX` holds that value; a subject in the
plain `repo:<owner>/<repo>` form is rejected with `Not authorized to perform
sts:AssumeRoleWithWebIdentity`.

```sh
aws iam create-role --role-name boxhead2play-github-deploy --assume-role-policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Principal\": {\"Federated\": \"arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com\"},
    \"Action\": \"sts:AssumeRoleWithWebIdentity\",
    \"Condition\": {\"StringEquals\": {
      \"token.actions.githubusercontent.com:aud\": \"sts.amazonaws.com\",
      \"token.actions.githubusercontent.com:sub\": \"${SUB_PREFIX}:ref:refs/heads/main\"
    }}
  }]
}"
aws iam put-role-policy --role-name boxhead2play-github-deploy --policy-name deploy --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": \"ecr:GetAuthorizationToken\", \"Resource\": \"*\"},
    {\"Effect\": \"Allow\", \"Action\": [
       \"ecr:BatchCheckLayerAvailability\", \"ecr:BatchGetImage\", \"ecr:CompleteLayerUpload\",
       \"ecr:InitiateLayerUpload\", \"ecr:PutImage\", \"ecr:UploadLayerPart\"],
     \"Resource\": \"arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/boxhead2play\"},
    {\"Effect\": \"Allow\", \"Action\": [
       \"ecs:DescribeTaskDefinition\", \"ecs:RegisterTaskDefinition\",
       \"ecs:DescribeServices\", \"ecs:UpdateService\"],
     \"Resource\": \"*\"},
    {\"Effect\": \"Allow\", \"Action\": \"iam:PassRole\",
     \"Resource\": \"arn:aws:iam::${ACCOUNT_ID}:role/boxhead2play-ecs-execution\"}
  ]
}"
```

### 6. Task definition and service

Register the first revision. Its image tag `bootstrap` does not exist yet, which is fine
because the service starts with no tasks:

```sh
envsubst '${ACCOUNT_ID} ${AWS_REGION}' < deploy/ecs/task-definition.json > /tmp/boxhead2play-td.json
aws ecs register-task-definition --cli-input-json file:///tmp/boxhead2play-td.json
```

The task needs a public subnet with `assignPublicIp` so it can pull images and reach
Cloudflare without a NAT gateway, and a security group with no inbound rules:

```sh
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 create-security-group --group-name boxhead2play-task --description "boxhead2play task, outbound only" \
  --vpc-id $VPC --query GroupId --output text)

aws ecs create-service --cluster boxhead2play --service-name boxhead2play \
  --task-definition boxhead2play --desired-count 0 --launch-type FARGATE \
  --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}"
```

### 7. GitHub repository variables

Settings, Secrets and variables, Actions, Variables:

| Variable | Value |
|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::<account>:role/boxhead2play-github-deploy` |
| `AWS_REGION` | `ap-southeast-2` |
| `ECR_REPOSITORY` | `boxhead2play` |
| `ECS_CLUSTER` | `boxhead2play` |
| `ECS_SERVICE` | `boxhead2play` |
| `ECS_TASK_FAMILY` | `boxhead2play` |

### 8. First deploy

Run the `ecs` workflow (Actions, ecs, Run workflow). It pushes the image and registers a
revision that uses it. Then start the task:

```sh
aws ecs update-service --cluster boxhead2play --service boxhead2play --desired-count 1
```

From then on every push to `main` deploys.

## Operating

```sh
aws logs tail /ecs/boxhead2play --follow
aws ecs describe-services --cluster boxhead2play --services boxhead2play \
  --query 'services[0].[status,runningCount,deployments[0].rolloutState]'
npm run monitor -- --url https://boxhead.example.com --token "$(aws ssm get-parameter \
  --name /boxhead2play/monitor-token --with-decryption --query Parameter.Value --output text)"
```

Stop it without deleting anything with `--desired-count 0`.

## Cost

A 0.25 vCPU / 0.5 GB ARM64 task running all month, the public IPv4 address, a few ECR images
and the log group. There is no load balancer and no NAT gateway. The tunnel is free.
