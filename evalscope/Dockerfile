FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "evalscope[service]"

COPY custom_metrics/ /app/custom_metrics/
COPY startup.py /app/startup.py

WORKDIR /app

EXPOSE 9000

CMD ["python", "startup.py"]
