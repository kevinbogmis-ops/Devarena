# ==========================================================================
# DEVARENA - ENVIRONNEMENT DE LABS (DSOXLab) - PREUVE DE CONCEPT
# Terminal de labs reproductible : dsoxlab + catalogues en versions figées.
# Totalement séparé de l'application web : jamais exposé sur le réseau.
#
#   dsoxlab   : https://github.com/stephrobert/dsoxlab (Apache-2.0)
#   catalogues: https://github.com/stephrobert (CC-BY-4.0, Stéphane Robert)
# ==========================================================================

FROM python:3.12-slim-bookworm

ARG DSOXLAB_VERSION=0.5.5
# 1.16.x : le catalogue exige >= 1.15 et un lab ~> 1.16.0
ARG TERRAFORM_VERSION=1.16.7
ARG TERRAFORM_CATALOG_SHA=13bf8439b6002deeaa1965dad1736e7123fe30d3
ARG CONTAINERS_CATALOG_SHA=47fb4c60f2c7867fcdb2ed983a1658ec31f523af

ENV DEBIAN_FRONTEND=noninteractive \
    DSOXLAB_LANG=fr \
    PATH=/opt/dsoxlab/bin:$PATH

# Outils de base utilisés par les labs « shell »
RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl unzip ca-certificates less nano \
 && rm -rf /var/lib/apt/lists/*

# Terraform (binaire officiel, version figée)
RUN curl -fsSL -o /tmp/tf.zip \
      "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
 && unzip /tmp/tf.zip -d /usr/local/bin terraform \
 && rm /tmp/tf.zip

# Client Docker seul (le moteur est le service docker:dind séparé, profil lab-docker)
ARG DOCKER_CLI_VERSION=27.5.1
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
     | tar -xz -C /usr/local/bin --strip-components=1 docker/docker

# dsoxlab dans un venv dédié (version figée)
RUN python -m venv /opt/dsoxlab \
 && /opt/dsoxlab/bin/pip install --no-cache-dir "dsoxlab==${DSOXLAB_VERSION}"

# Utilisateur non-root, comme l'application
RUN useradd -m -s /bin/bash student
USER student
WORKDIR /home/student

# Catalogues clonés à un commit précis (reproductibilité)
RUN mkdir -p catalogs \
 && git clone -q https://github.com/stephrobert/terraform-dsoxlab-training.git catalogs/terraform \
 && git -C catalogs/terraform checkout -q ${TERRAFORM_CATALOG_SHA} \
 && git clone -q https://github.com/stephrobert/containers-dsoxlab-training.git catalogs/containers \
 && git -C catalogs/containers checkout -q ${CONTAINERS_CATALOG_SHA}

CMD ["bash"]
