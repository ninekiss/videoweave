from pathlib import Path
import re

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from videoweave_api.core.config import Settings

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "asset"
    return _SAFE_FILENAME.sub("_", name)


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.bucket = settings.s3_bucket
        addressing_style = "path" if settings.s3_force_path_style else "auto"
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": addressing_style}),
        )

    def ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    def build_asset_key(self, project_id: str, asset_id: str, filename: str) -> str:
        return f"projects/{project_id}/assets/{asset_id}/{safe_filename(filename)}"

    def create_multipart_upload(self, key: str, mime_type: str | None) -> str:
        self.ensure_bucket()
        kwargs: dict = {"Bucket": self.bucket, "Key": key}
        if mime_type:
            kwargs["ContentType"] = mime_type
        return self.client.create_multipart_upload(**kwargs)["UploadId"]

    def presign_upload_part(self, key: str, upload_id: str, part_number: int) -> str:
        return self.client.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=self.settings.s3_presign_expiry_seconds,
        )

    def list_parts(self, key: str, upload_id: str) -> list[dict]:
        parts: list[dict] = []
        marker: int | None = None
        while True:
            kwargs: dict = {"Bucket": self.bucket, "Key": key, "UploadId": upload_id}
            if marker is not None:
                kwargs["PartNumberMarker"] = marker
            response = self.client.list_parts(**kwargs)
            parts.extend(response.get("Parts", []))
            if not response.get("IsTruncated"):
                return parts
            marker = response.get("NextPartNumberMarker")

    def complete_multipart_upload(self, key: str, upload_id: str, parts: list[dict]) -> None:
        self.client.complete_multipart_upload(
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )

    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        self.client.abort_multipart_upload(Bucket=self.bucket, Key=key, UploadId=upload_id)

    def download_file(self, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(self.bucket, key, str(destination))

    def upload_file(self, source: Path, key: str, content_type: str | None = None) -> None:
        self.ensure_bucket()
        extra_args = {"ContentType": content_type} if content_type else None
        if extra_args:
            self.client.upload_file(str(source), self.bucket, key, ExtraArgs=extra_args)
        else:
            self.client.upload_file(str(source), self.bucket, key)

    def delete_objects(self, keys: list[str]) -> None:
        unique_keys = list(dict.fromkeys(key for key in keys if key and key != "pending"))
        for offset in range(0, len(unique_keys), 1000):
            batch = unique_keys[offset : offset + 1000]
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
            )

    def presign_get(self, key: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.settings.s3_presign_expiry_seconds,
        )