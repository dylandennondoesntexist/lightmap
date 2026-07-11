# Security policy

Please do not open public issues for suspected vulnerabilities or include live
Firebase credentials, location data, or user records in an issue.

Use GitHub's **Security** tab to privately report a vulnerability. Include the
affected component, reproduction steps, and potential impact. Maintainers will
acknowledge a report as soon as practical.

Firebase web configuration is an identifier used by the client, not a server
secret. Security depends on the deployed Realtime Database rules, restricted
IAM access, and (for public deployments) Firebase App Check enforcement.
