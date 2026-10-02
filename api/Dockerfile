FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 ENV=prod
WORKDIR /srv

COPY api/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt && useradd --create-home --uid 10001 app

COPY api/app ./api/app
COPY api/scripts ./api/scripts
COPY content ./content

ENV CONTENT_DIR=/srv/content
WORKDIR /srv/api
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
