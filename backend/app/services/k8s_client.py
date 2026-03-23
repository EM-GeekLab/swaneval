"""Thread-safe Kubernetes client factory.

Uses `new_client_from_config` to avoid mutating global K8s config state,
making it safe for concurrent use with different kubeconfigs.
"""

import base64
import os
import tempfile

import yaml

from app.services.encryption import decrypt


def create_api_client(kubeconfig_encrypted: str):
    """Create a thread-safe K8s ApiClient from encrypted kubeconfig.

    Returns a kubernetes.client.ApiClient instance that can be passed to
    any API class (CoreV1Api, AppsV1Api, etc.) without affecting global state.
    """
    from kubernetes import config

    kubeconfig_yaml = decrypt(kubeconfig_encrypted)
    kubeconfig_dict = yaml.safe_load(kubeconfig_yaml)

    # Inline certificate data to avoid temp file path references
    _inline_cert_data(kubeconfig_dict)

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False)
    try:
        yaml.dump(kubeconfig_dict, tmp)
        tmp.close()
        # new_client_from_config returns an ApiClient WITHOUT touching global state
        return config.new_client_from_config(config_file=tmp.name)
    finally:
        os.unlink(tmp.name)


def create_core_v1(kubeconfig_encrypted: str):
    """Create a CoreV1Api client."""
    from kubernetes import client
    return client.CoreV1Api(api_client=create_api_client(kubeconfig_encrypted))


def create_apps_v1(kubeconfig_encrypted: str):
    """Create an AppsV1Api client."""
    from kubernetes import client
    return client.AppsV1Api(api_client=create_api_client(kubeconfig_encrypted))


def create_both(kubeconfig_encrypted: str):
    """Create CoreV1Api + AppsV1Api sharing one ApiClient."""
    from kubernetes import client
    api_client = create_api_client(kubeconfig_encrypted)
    return client.CoreV1Api(api_client=api_client), client.AppsV1Api(api_client=api_client)


def _inline_cert_data(kubeconfig_dict: dict) -> None:
    """Inline certificate file references as base64 data to avoid temp file path issues."""
    for cluster in kubeconfig_dict.get("clusters", []):
        c = cluster.get("cluster", {})
        _inline_file_field(c, "certificate-authority", "certificate-authority-data")
    for user in kubeconfig_dict.get("users", []):
        u = user.get("user", {})
        _inline_file_field(u, "client-certificate", "client-certificate-data")
        _inline_file_field(u, "client-key", "client-key-data")


def _inline_file_field(obj: dict, file_key: str, data_key: str) -> None:
    """If obj has a file path reference, read it and store as base64 data."""
    if file_key in obj and data_key not in obj:
        path = obj[file_key]
        if os.path.isfile(path):
            with open(path, "rb") as f:
                obj[data_key] = base64.b64encode(f.read()).decode("ascii")
            del obj[file_key]
