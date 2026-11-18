#!/usr/bin/env python3
"""Checks that a .p12 certificate and a .mobileprovision can sign NEON RUSH.

Runs on macOS, Linux or Windows (needs the `openssl` command). Nothing is uploaded and
the private key is never written to disk or printed.

usage:
  python3 BuildTools/verify_signing.py --p12 cert.p12 --profile app.mobileprovision [--udid DEVICE-UDID]

The .p12 password is read from the NR_P12_PASSWORD environment variable, or asked for
interactively (hidden input) when that variable is not set.
"""
import argparse
import datetime as dt
import getpass
import hashlib
import os
import plistlib
import re
import subprocess
import sys

BUNDLE_ID = "com.sufyan.neonrush"


def run(args, data=None, env=None):
    p = subprocess.run(args, input=data, capture_output=True, env=env)
    return p.returncode, p.stdout, p.stderr


def load_profile(path):
    code, out, err = run(["openssl", "smime", "-inform", "der", "-verify", "-noverify", "-in", path])
    if code != 0 or not out.strip():
        # Some OpenSSL builds prefer the cms command.
        code, out, err = run(["openssl", "cms", "-inform", "der", "-verify", "-noverify", "-in", path])
    if code != 0 or not out.strip():
        raise SystemExit("Cannot decode provisioning profile: " + err.decode(errors="replace").strip())
    return plistlib.loads(out)


def p12_cert_der(path, password):
    env = dict(os.environ, NR_P12_PASSWORD_INTERNAL=password)
    for legacy in ([], ["-legacy"]):
        code, pem, err = run(["openssl", "pkcs12", "-in", path, "-nokeys", "-clcerts",
                              "-passin", "env:NR_P12_PASSWORD_INTERNAL"] + legacy, env=env)
        if code == 0 and b"BEGIN CERTIFICATE" in pem:
            code, der, err = run(["openssl", "x509", "-outform", "der"], data=pem)
            if code == 0:
                return der, legacy
    raise SystemExit("Cannot open the .p12 (wrong password or unsupported format): " + err.decode(errors="replace").strip())


def p12_has_key(path, password, legacy):
    env = dict(os.environ, NR_P12_PASSWORD_INTERNAL=password)
    code, out, _ = run(["openssl", "pkcs12", "-in", path, "-nocerts", "-nodes",
                        "-passin", "env:NR_P12_PASSWORD_INTERNAL"] + legacy, env=env)
    has = code == 0 and b"PRIVATE KEY" in out
    del out
    return has


def cert_info(der):
    code, out, _ = run(["openssl", "x509", "-inform", "der", "-noout", "-subject", "-enddate"], data=der)
    text = out.decode(errors="replace")
    subject = re.search(r"subject=(.*)", text)
    end = re.search(r"notAfter=(.*)", text)
    expiry = None
    if end:
        try:
            expiry = dt.datetime.strptime(end.group(1).strip(), "%b %d %H:%M:%S %Y %Z")
        except ValueError:
            pass
    return (subject.group(1).strip() if subject else "?"), expiry


def profile_kind(p):
    ent = p.get("Entitlements", {})
    if p.get("ProvisionsAllDevices"):
        return "enterprise"
    if p.get("ProvisionedDevices"):
        return "development" if ent.get("get-task-allow") else "ad-hoc"
    return "app-store"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--p12", required=True)
    ap.add_argument("--profile", required=True)
    ap.add_argument("--udid", help="device UDID that must be in the profile (ad-hoc / development)")
    ap.add_argument("--bundle-id", default=BUNDLE_ID)
    args = ap.parse_args()

    password = os.environ.get("NR_P12_PASSWORD")
    if password is None:
        password = getpass.getpass("P12 password: ")

    problems, notes = [], []
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)

    prof = load_profile(args.profile)
    ent = prof.get("Entitlements", {})
    app_id = ent.get("application-identifier", "")
    team = (prof.get("TeamIdentifier") or ["?"])[0]
    profile_bundle = app_id.split(".", 1)[1] if "." in app_id else app_id
    kind = profile_kind(prof)
    exp = prof.get("ExpirationDate")

    print("Profile        :", prof.get("Name"), "(" + str(prof.get("UUID")) + ")")
    print("Type           :", kind)
    print("Team           :", team, "-", prof.get("TeamName", ""))
    print("App ID         :", app_id)
    print("Expires        :", exp)

    if profile_bundle == args.bundle_id:
        notes.append("bundle id matches exactly")
    elif profile_bundle.endswith("*") and args.bundle_id.startswith(profile_bundle[:-1]):
        notes.append("wildcard profile covers " + args.bundle_id)
    else:
        problems.append("profile is for '%s' but the app is '%s' (the app bundle id is not changed to fit)" % (profile_bundle, args.bundle_id))

    if isinstance(exp, dt.datetime) and exp.replace(tzinfo=None) < now:
        problems.append("provisioning profile expired on %s" % exp)

    devices = prof.get("ProvisionedDevices") or []
    if devices:
        print("Devices        :", len(devices))
    if args.udid:
        if prof.get("ProvisionsAllDevices"):
            notes.append("enterprise profile: any device")
        elif args.udid.upper() in (d.upper() for d in devices):
            notes.append("device UDID is in the profile")
        else:
            problems.append("device %s is NOT in the profile" % args.udid)
    if kind == "app-store":
        problems.append("App Store profiles cannot install on devices directly (use ad-hoc / development / enterprise for ESign)")

    der, legacy = p12_cert_der(args.p12, password)
    subject, cert_exp = cert_info(der)
    print("Certificate    :", subject)
    print("Cert expires   :", cert_exp)
    if cert_exp and cert_exp < now:
        problems.append("certificate expired on %s" % cert_exp)
    if not p12_has_key(args.p12, password, legacy):
        problems.append("the .p12 has no private key (export it from Keychain with the key)")

    fp = hashlib.sha1(der).hexdigest().upper()
    profile_fps = [hashlib.sha1(bytes(c)).hexdigest().upper() for c in prof.get("DeveloperCertificates", [])]
    print("Cert SHA-1     :", fp)
    if fp in profile_fps:
        notes.append("certificate is embedded in the profile")
    else:
        problems.append("certificate is NOT one of the profile's %d developer certificates" % len(profile_fps))

    print()
    for n in notes:
        print("  OK   ", n)
    for p in problems:
        print("  FAIL ", p)
    print()
    if problems:
        print("RESULT: NOT COMPATIBLE — fix the items above before signing.")
        return 1
    print("RESULT: compatible. Sign with ESign, or on macOS:")
    print("  NR_P12_PATH=... NR_PROFILE_PATH=... NR_P12_PASSWORD=... NR_EXPORT_METHOD=%s BuildTools/make_ipa.sh" % kind)
    return 0


if __name__ == "__main__":
    sys.exit(main())
