packer {
  required_version = ">= 1.10.0"
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
    googlecompute = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/googlecompute"
    }
    docker = {
      version = ">= 1.0.8"
      source  = "github.com/hashicorp/docker"
    }
  }
}

variable "clawql_version" {
  type        = string
  default     = "latest"
  description = "npm dist-tag or semver for clawql-mcp install"
}

variable "sync_prefix" {
  type        = string
  default     = "teams/shared/"
  description = "Default team bucket prefix written to sync.json at bake time"
}

variable "sync_provider" {
  type        = string
  default     = "r2"
  description = "Object storage provider in bake-time sync.json (r2|s3|gcs)"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "gcp_project_id" {
  type        = string
  default     = "packer-validate-placeholder"
  description = "GCP project for image build (placeholder ok for validate-only)"
}

variable "gcp_zone" {
  type    = string
  default = "us-central1-a"
}

locals {
  scripts_dir = "${path.root}/../scripts/packer"
}

# CI validate — no cloud credentials required.
source "docker" "validate" {
  image  = "ubuntu:24.04"
  discard = true
}

source "amazon-ebs" "clawql" {
  region        = var.aws_region
  instance_type = "t3.medium"
  ssh_username  = "ubuntu"
  ami_name      = "clawql-golden-host-${var.clawql_version}-{{timestamp}}"

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["099720109477"]
    most_recent = true
  }

  tags = {
    Name        = "clawql-golden-host"
    ClawQL      = var.clawql_version
    ManagedBy   = "packer"
  }
}

source "googlecompute" "clawql" {
  project_id              = var.gcp_project_id
  zone                    = var.gcp_zone
  machine_type            = "e2-medium"
  ssh_username            = "ubuntu"
  disk_size               = 20
  image_name              = "clawql-golden-host-${var.clawql_version}-{{timestamp}}"
  image_family            = "clawql-golden-host"
  source_image_family     = "ubuntu-2404-lts-amd64"
  source_image_project_id = ["ubuntu-os-cloud"]

  image_labels = {
    clawql_version = replace(var.clawql_version, ".", "-")
    managed_by     = "packer"
  }
}

build {
  name = "clawql-golden-host"

  sources = [
    "source.docker.validate",
    "source.amazon-ebs.clawql",
    "source.googlecompute.clawql",
  ]

  provisioner "shell" {
    environment_vars = [
      "CLAWQL_VERSION=${var.clawql_version}",
      "CLAWQL_SYNC_PREFIX=${var.sync_prefix}",
      "CLAWQL_SYNC_PROVIDER=${var.sync_provider}",
    ]
    scripts = ["${local.scripts_dir}/bake-clawql.sh"]
  }

  provisioner "file" {
    source      = "${local.scripts_dir}/bootstrap-team-vault.sh"
    destination = "/tmp/bootstrap-team-vault.sh"
  }

  provisioner "file" {
    source      = "${local.scripts_dir}/bootstrap-dedicated-gateway.sh"
    destination = "/tmp/bootstrap-dedicated-gateway.sh"
  }

  provisioner "file" {
    source      = "${local.scripts_dir}/cloudflare-bootstrap.sh"
    destination = "/tmp/cloudflare-bootstrap.sh"
  }

  provisioner "shell" {
    inline = [
      "install -m 0755 /tmp/bootstrap-team-vault.sh /usr/local/bin/bootstrap-team-vault.sh",
      "install -m 0755 /tmp/bootstrap-dedicated-gateway.sh /usr/local/bin/bootstrap-dedicated-gateway.sh",
      "install -m 0755 /tmp/cloudflare-bootstrap.sh /usr/local/bin/cloudflare-bootstrap.sh",
      "rm -f /tmp/bootstrap-team-vault.sh /tmp/bootstrap-dedicated-gateway.sh /tmp/cloudflare-bootstrap.sh",
    ]
  }

  # Post-bake gate on docker validate target (doctor may warn without credentials).
  provisioner "shell" {
    only = ["source.docker.validate"]
    inline = [
      "test -f /root/.ClawQL/sync.json",
      "grep -q CONFIGURE_AT_BOOT /root/.ClawQL/sync.json",
      "command -v clawql",
      "test -x /usr/local/bin/bootstrap-team-vault.sh",
      "test -x /usr/local/bin/bootstrap-dedicated-gateway.sh",
    ]
  }
}
