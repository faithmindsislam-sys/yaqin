# Yaqin API

FastAPI backend for content, account administration, scholarly review, and the AI tutor.
The public HTTP contract is in [../docs/CONTRACT.md](../docs/CONTRACT.md).

## Open and run in PyCharm

1. Open **this `api` directory** as the PyCharm project.
2. Select the existing interpreter `api/.venv/bin/python` in **Settings → Python Interpreter**.
   For a fresh checkout, create a Python 3.12+ virtual environment and install the project below.
3. Select **Yaqin API** from the run configuration menu, then **Run** or **Debug**.
   The shared configurations are saved in `.run/`. **Yaqin Tests** runs the test suite.
4. Open http://127.0.0.1:8000/api/docs. The startup script is `run.py`.

The debugger runs one process. For automatic restarts from the terminal, use `--reload`.
PyCharm needs an interpreter and a Python run configuration; there is no separate startup solution file.
See [JetBrains' Python run configuration guide](https://www.jetbrains.com/help/pycharm/run-debug-configuration-python.html).

## Terminal setup

From `api/`:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
# Fresh checkout: create the private configuration file and add your settings.
touch .env
chmod 600 .env
.venv/bin/python run.py --reload
```

Health: http://127.0.0.1:8000/api/health · OpenAPI: http://127.0.0.1:8000/api/openapi.json

## Structure and dependency rules

```text
api/
├── pyproject.toml              Dependencies, Python version, test/tool settings
├── run.py                      PyCharm and terminal startup
├── .env                        One private backend configuration file (ignored)
├── .run/                       Shared PyCharm run and test configurations
├── app/
│   ├── main.py                 FastAPI factory, middleware, startup and shutdown
│   ├── container.py            Provider selection and service/agent composition
│   ├── dependencies.py         Request access to application-owned services
│   ├── configuration/          Typed settings, independent of working directory
│   ├── controllers/            HTTP routes, parameters, responses
│   ├── contracts/              Validated request schemas
│   ├── domain/                 Users, lesson/source rules, text safety
│   ├── services/               Content, authoring, review and account use cases
│   ├── agents/
│   │   ├── tutor/              Tutor agent and its prompts/schemas
│   │   └── review/             Pre-review agent and its prompts/schemas
│   ├── repositories/           Repository contract, PostgreSQL, memory and content files
│   ├── gateways/
│   │   ├── llm_gateway.py      Abstract model gateway and failure contract
│   │   ├── embedding_gateway.py
│   │   ├── token_gateway.py
│   │   ├── quran_gateway.py
│   │   ├── bedrock/            Claude and Titan gateway implementations
│   │   ├── supabase_token_gateway.py
│   │   └── quran_catalog_gateway.py
│   └── http/                   Authentication dependencies, errors, rate limits
├── scripts/                    Seeding, source fetching, live safety evaluation
└── tests/
    ├── api/                    HTTP permissions, content, tutor, review and accounts
    ├── architecture/           Layer boundaries, configuration and lifecycle
    ├── domain/                 Source text, metadata and passage rules
    ├── gateways/               Provider failures, validation and resource cleanup
    ├── repositories/           Persisted content and indexing regression
    ├── services/               Retrieval with injected embedding gateways
    ├── fixtures/               Shared sample data, with no live credentials
    └── conftest.py             Shared configuration and fake-model fixtures
```

Controllers bind HTTP requests and delegate to injected services or agents. The health
endpoint uses the repository interface to check connectivity. Services and agents receive
the `Repository` protocol and abstract gateway interfaces through their constructors;
only `container.py` chooses the concrete providers and assembles the application. Repositories
keep multi-step database writes in transactions and apply shared domain rules inside those
transactions. Provider SDK details, timeouts and retries belong in gateways. HTTP authentication
uses `TokenGateway` and handles `InvalidSessionToken` without importing Supabase or JWT SDKs.
FastAPI's lifespan owns the provider clients and storage connection pool, and closes every
resource on shutdown, even when another resource fails to close. Applications never share
module-global provider clients or source catalogs.

Interfaces live beside the implementations they describe, following Adventoura:
`gateways/llm_gateway.py` declares `LLMGateway`, and `gateways/bedrock/llm_gateway.py`
implements it. `repositories/repository.py` declares the shared storage protocol.
Application code imports these contracts directly; no separate interface layer is needed.

The domain imports no HTTP framework, provider SDK or persistence implementation.
Contracts contain validation without infrastructure access. `tests/architecture/test_architecture.py`
enforces these boundaries. Keep a new agent's workflow and prompts together in its own
folder when a new workflow exists. Add provider subfolders when several related adapters
exist, as with Bedrock's model and embedding gateways. Services stay together while they
remain small and focused. Shared business rules belong in `domain/`, configuration in
`configuration/`, and HTTP concerns in `http/`; avoid a generic `common/` or `utils/` folder.
Comments explain safety invariants, provider limitations and lifecycle decisions.

The layout draws on Geeby's layered backend and Adventoura's agent/gateway/repository split.
The public URLs, request shapes, error envelope, permissions and source safety rules are unchanged.

## One backend environment file

All local backend configuration and secrets live in **`api/.env`**, loaded using an absolute
path. The API, seed command and deployment script use that same file. Shell/deployment
variables take precedence. Keep it private; the Docker build and deployment source archive
exclude environment files.

Existing values must be preserved when adding settings. The frontend's `web/.env.local`
contains its browser configuration and public Supabase key; private backend secrets must
never be copied into `NEXT_PUBLIC_*` variables.

- Empty `DATABASE_URL`: read `../content/` using an in-memory repository and BM25 search.
  Local in-memory edits disappear on restart. Set `DATABASE_URL` to persist changes.
- `DATABASE_URL`: Supabase transaction pooler connection string, including password.
- `SUPABASE_URL`: project URL for token verification.
- `YAQIN_AWS_PROFILE`: an explicit personal account profile. Work-account profiles are refused;
  the shell's `AWS_PROFILE` is deliberately ignored. ECS uses its attached task role.
- `AWS_REGION` / `BEDROCK_REGION`: embedding and Claude regions respectively.
- Empty AWS profile without a task role: clearly labelled offline tutor and keyword grading.
- `DEV_ROLE`: optional local-only role override; leave empty for normal authentication.
- `ORIGIN_VERIFY`: private CloudFront origin header used by `infra/deploy-api.sh`.

`ENV=prod` requires a database and Supabase URL. Production receives environment variables
from its task definition and Secrets Manager. Settings reject invalid limits and environment names.

## Database and content tools

Apply migrations in the order documented in [Supabase setup](../docs/SUPABASE_SETUP.md),
then seed from `api/`:

```bash
.venv/bin/python -m scripts.seed
.venv/bin/python -m scripts.seed --no-embed
```

Re-running preserves stored source approvals, lesson edits and curriculum updates;
unchanged chunks keep their embeddings.

```bash
.venv/bin/python -m scripts.fetch_sources quran:5:6 quran:1:1-7 hadith:bukhari:1 hadith:muslim:223 --out ../content/sources
```

Fetched sources remain pending until a scholarly reviewer approves them.

## Verification

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m scripts.eval_safety --base http://127.0.0.1:8000 --json eval.json
```

Regression tests use fixtures and mocked model responses, with all live credentials disabled.
PyCharm's **Yaqin Tests** configuration discovers all nested test folders. To run one area:

```bash
.venv/bin/python -m pytest tests/gateways -q
.venv/bin/python -m pytest tests/api -q
```

The live safety evaluator requires Bedrock and reports automated checks plus items for human review.

Roles are `learner`, `teacher`, `admin`, and `super_admin`. Legacy instructor/reviewer profiles
remain compatible. Teachers manage their drafts; admins review and publish; only super admins
manage account roles. [Account contract](../docs/CONTRACT.md#accounts-and-access).

## Docker

Build from the repository root so the image includes `content/`:

```bash
docker build -f api/Dockerfile -t yaqin-api .
docker run -p 8000:8000 --env-file api/.env yaqin-api
```

Dependencies are defined once in `pyproject.toml`, used by local setup and Docker.
No live migrations or deployment are performed by startup.
