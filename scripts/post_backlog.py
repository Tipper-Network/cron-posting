#!/usr/bin/env python3
"""Post scheduled catalog rows due through Beirut today (YouTube + Instagram).

Source of truth for this catch-up: step-4-ready-to-post/publish_catalog.csv
(Sheet write is best-effort if Sheets OAuth can access the spreadsheet).

YouTube always gets youtube_title + description (+ hashtags / collaborator credits).
"""

from __future__ import annotations

import csv
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

WORKSPACE = Path(__file__).resolve().parents[2]
CSV_PATH = WORKSPACE / "step-4-ready-to-post" / "publish_catalog.csv"
YT_TOKEN = WORKSPACE / "integrations" / "platforms" / "youtube" / "credentials" / "youtube-token.json"
SHEETS_TOKEN = WORKSPACE / "step-5-google-sheets" / "credentials" / "sheets-token.json"
GRAPH = "https://graph.facebook.com/v20.0"
LOG = WORKSPACE / "cron_posting" / "backlog-post.log"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for path in (WORKSPACE / "integrations" / ".env", WORKSPACE / "cron_posting" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def beirut_today() -> str:
    return datetime.now(ZoneInfo("Asia/Beirut")).date().isoformat()


def youtube_title(row: dict[str, str]) -> str:
    title = (row.get("youtube_title") or row.get("title") or row.get("id") or "").strip()
    if not title:
        raise RuntimeError(f"missing youtube_title for {row.get('id')}")
    return title[:100]


def youtube_description(row: dict[str, str]) -> str:
    title = (row.get("youtube_title") or row.get("title") or "").strip()
    base = (row.get("description") or "").strip() or title
    if not base:
        raise RuntimeError(f"missing description for {row.get('id')}")
    parts = [base]
    tags = (row.get("hashtags") or "").strip()
    if tags and tags not in base:
        parts.append(tags)
    env = load_env()
    handles = [
        f"@{h.strip().lstrip('@')}"
        for h in (row.get("collaborators") or env.get("YOUTUBE_COLLABORATORS") or "").split(",")
        if h.strip()
    ]
    credit = " ".join(handles)
    if credit and credit not in base:
        parts.append(credit)
    return "\n\n".join(parts).strip()[:5000]


def youtube_tags(hashtags: str) -> list[str]:
    tags: list[str] = []
    used = 0
    for raw in hashtags.split():
        tag = raw.replace("#", "").strip()
        if not tag:
            continue
        next_len = used + len(tag) + (1 if tags else 0)
        if next_len > 480:
            break
        tags.append(tag)
        used = next_len
    return tags


def resolve_mp4(row: dict[str, str]) -> Path:
    vp = (row.get("video_path") or "").strip()
    cands = [
        WORKSPACE / vp,
        WORKSPACE / "step-4-ready-to-post" / vp.replace("step-4-ready-to-post/", ""),
    ]
    for path in cands:
        if path.exists():
            return path
    raise FileNotFoundError(vp)


def youtube_client() -> object:
    creds = Credentials.from_authorized_user_file(str(YT_TOKEN))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        YT_TOKEN.write_text(creds.to_json(), encoding="utf-8")
    yt = build("youtube", "v3", credentials=creds)
    items = yt.channels().list(part="snippet", mine=True).execute().get("items") or []
    if not items:
        raise RuntimeError(
            "YouTube token has no channel (mine=True empty). Re-auth and pick The G.A.F. Brand Account."
        )
    expected = load_env().get("YOUTUBE_CHANNEL_ID")
    channel_id = items[0]["id"]
    if expected and channel_id != expected:
        raise RuntimeError(f"token channel {channel_id} != YOUTUBE_CHANNEL_ID {expected}")
    print(f"YouTube channel: {items[0]['snippet'].get('title')} ({channel_id})")
    return yt


def upload_youtube(yt, row: dict[str, str], mp4: Path) -> str:
    title = youtube_title(row)
    description = youtube_description(row)
    tags = youtube_tags(row.get("hashtags") or "")
    print(f"  YT title={title!r} details_len={len(description)} tags={len(tags)}")
    body = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags,
            "categoryId": load_env().get("YOUTUBE_CATEGORY_ID") or "22",
        },
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(str(mp4), mimetype="video/mp4", resumable=True, chunksize=8 * 1024 * 1024)
    request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  YT upload {int(status.progress() * 100)}%")
    video_id = response["id"]
    url = f"https://www.youtube.com/watch?v={video_id}"
    srt = mp4.with_suffix(".srt")
    if srt.exists():
        try:
            yt.captions().insert(
                part="snippet",
                body={"snippet": {"videoId": video_id, "language": "en", "name": "English"}},
                media_body=MediaFileUpload(str(srt), mimetype="application/octet-stream"),
            ).execute()
            print("  YT captions attached")
        except Exception as exc:  # noqa: BLE001
            print(f"  YT captions skipped: {exc}")
    return url


def ig_caption(row: dict[str, str]) -> str:
    description = (row.get("description") or row.get("youtube_title") or row.get("title") or "").strip()
    tags = (row.get("hashtags") or "").strip()
    caption = f"{description}\n\n{tags}" if tags and tags not in description else description
    return caption.strip()[:2200]


def publish_instagram(row: dict[str, str]) -> str:
    env = load_env()
    token = env.get("META_ACCESS_TOKEN") or env.get("IG_ACCESS_TOKEN") or ""
    ig_id = env.get("IG_BUSINESS_ID") or ""
    if not token or not ig_id:
        raise RuntimeError("Set META_ACCESS_TOKEN and IG_BUSINESS_ID")
    media_url = (row.get("media_url") or "").strip()
    if not media_url:
        raise RuntimeError(f"missing media_url for {row.get('id')}")
    # public readable check
    req = urllib.request.Request(media_url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 206):
                raise RuntimeError(f"media_url HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        if exc.code not in (200, 206):
            # some hosts reject HEAD; try range GET
            req = urllib.request.Request(media_url, headers={"Range": "bytes=0-15"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status not in (200, 206):
                    raise

    collabs = [
        c.strip().lstrip("@")
        for c in (env.get("IG_COLLABORATORS") or "").split(",")
        if c.strip()
    ]
    payload = {
        "media_type": "REELS",
        "video_url": media_url,
        "caption": ig_caption(row),
        "share_to_feed": "false",
        "access_token": token,
    }
    if collabs:
        payload["collaborators"] = json.dumps(collabs)
    created = graph_post(f"/{ig_id}/media", payload)
    creation_id = created.get("id")
    if not creation_id:
        raise RuntimeError(f"IG create failed: {created}")
    wait_ig_finished(creation_id, token)
    published = graph_post(
        f"/{ig_id}/media_publish",
        {"creation_id": creation_id, "access_token": token},
    )
    media_id = published.get("id")
    if not media_id:
        raise RuntimeError(f"IG publish failed: {published}")
    try:
        data = graph_get(f"/{media_id}", {"fields": "permalink", "access_token": token})
        if data.get("permalink"):
            return data["permalink"]
    except Exception:  # noqa: BLE001
        pass
    return f"graph:{media_id}"


def graph_get(path: str, params: dict[str, str]) -> dict:
    url = f"{GRAPH}{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.loads(resp.read().decode())


def graph_post(path: str, params: dict[str, str]) -> dict:
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{GRAPH}{path}", data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        raise RuntimeError(body[:500]) from exc


def wait_ig_finished(creation_id: str, token: str) -> None:
    deadline = time.time() + 600
    while time.time() < deadline:
        data = graph_get(f"/{creation_id}", {"fields": "status_code", "access_token": token})
        code = data.get("status_code")
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"IG container {creation_id} {code}")
        time.sleep(10)
    raise RuntimeError(f"IG container {creation_id} timeout")


def due_rows() -> list[dict[str, str]]:
    today = beirut_today()
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    out = []
    for row in rows:
        if (row.get("status") or "").lower() != "scheduled":
            continue
        if (row.get("scheduled_date") or "") > today:
            continue
        if (row.get("instagram_url") or "") and (row.get("youtube_url") or ""):
            continue
        out.append(row)
    out.sort(key=lambda r: (r.get("scheduled_date") or "", r.get("publish_order") or ""))
    return out


def write_csv(rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def try_sheet_patch(row: dict[str, str], patch: dict[str, str]) -> None:
    env = load_env()
    sheet_id = env.get("GOOGLE_SHEETS_ID")
    tab = env.get("GOOGLE_SHEETS_TAB") or "publish_catalog"
    if not sheet_id or not SHEETS_TOKEN.exists():
        return
    try:
        creds = Credentials.from_authorized_user_file(
            str(SHEETS_TOKEN), scopes=["https://www.googleapis.com/auth/spreadsheets"]
        )
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        sheets = build("sheets", "v4", credentials=creds)
        header = (
            sheets.spreadsheets()
            .values()
            .get(spreadsheetId=sheet_id, range=f"'{tab}'!1:1")
            .execute()
            .get("values", [[]])[0]
        )
        # find row by entity/series/id
        values = (
            sheets.spreadsheets()
            .values()
            .get(spreadsheetId=sheet_id, range=f"'{tab}'")
            .execute()
            .get("values")
            or []
        )
        keys = [str(c).strip() for c in values[0]]
        sheet_row = None
        for i, raw in enumerate(values[1:], start=2):
            d = {keys[j]: (raw[j] if j < len(raw) else "") for j in range(len(keys))}
            if (
                d.get("entity") == row.get("entity")
                and d.get("series") == row.get("series")
                and d.get("id") == row.get("id")
            ):
                sheet_row = i
                break
        if not sheet_row:
            print("  Sheet row not found; CSV updated only")
            return
        data = []
        for key, value in patch.items():
            if key not in header:
                continue
            col = header.index(key)
            letter = ""
            n = col + 1
            while n:
                n, rem = divmod(n - 1, 26)
                letter = chr(65 + rem) + letter
            data.append({"range": f"'{tab}'!{letter}{sheet_row}", "values": [[value]]})
        if data:
            sheets.spreadsheets().values().batchUpdate(
                spreadsheetId=sheet_id,
                body={"valueInputOption": "RAW", "data": data},
            ).execute()
            print(f"  Sheet row {sheet_row} patched")
    except Exception as exc:  # noqa: BLE001
        print(f"  Sheet patch skipped: {exc}")


def main() -> int:
    today = beirut_today()
    print(f"Beirut today={today}")
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        all_rows = list(reader)

    queue = due_rows()
    print(f"Due missing URLs: {len(queue)}")
    if not queue:
        return 0

    yt = youtube_client()
    stamp = datetime.now(ZoneInfo("Asia/Beirut")).strftime("%Y-%m-%d %H:%M:%S %Z")

    for row in queue:
        label = f"{row.get('scheduled_date')} {row.get('entity')}/{row.get('series')}/{row.get('id')}"
        print(f"\n=== {label} ===")
        mp4 = resolve_mp4(row)
        ig_url = (row.get("instagram_url") or "").strip()
        yt_url = (row.get("youtube_url") or "").strip()
        errors: list[str] = []

        if not yt_url:
            try:
                yt_url = upload_youtube(yt, row, mp4)
                print(f"  YT {yt_url}")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"youtube: {exc}")
                print(f"  YT FAIL {exc}")

        if not ig_url:
            try:
                ig_url = publish_instagram(row)
                print(f"  IG {ig_url}")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"instagram: {exc}")
                print(f"  IG FAIL {exc}")

        # update in-memory + csv
        for full in all_rows:
            if (
                full.get("entity") == row.get("entity")
                and full.get("series") == row.get("series")
                and full.get("id") == row.get("id")
            ):
                if yt_url:
                    full["youtube_url"] = yt_url
                if ig_url:
                    full["instagram_url"] = ig_url
                if yt_url and ig_url and not errors:
                    full["status"] = "posted"
                    full["posted_at"] = stamp
                note = " | ".join(errors)
                if note:
                    full["schedule_note"] = note[:500]
                break

        write_csv(all_rows, fieldnames)
        patch = {}
        if yt_url:
            patch["youtube_url"] = yt_url
        if ig_url:
            patch["instagram_url"] = ig_url
        if yt_url and ig_url and not errors:
            patch["status"] = "posted"
            patch["posted_at"] = stamp
        if errors:
            patch["schedule_note"] = " | ".join(errors)[:500]
        try_sheet_patch(row, patch)
        LOG.write_text(
            (LOG.read_text(encoding="utf-8") if LOG.exists() else "")
            + f"{stamp}\t{label}\tyg={yt_url or '-'}\tig={ig_url or '-'}\t{errors}\n",
            encoding="utf-8",
        )

    print("\nDone.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"FATAL: {exc}", file=sys.stderr)
        raise SystemExit(1)
