# OrganicCord security patch for hpke-rs 0.6.1

This directory contains the source of `hpke-rs` 0.6.1, originally published by
Cryspen under MPL-2.0: https://github.com/cryspen/hpke-rs

OrganicCord changes only the SHAKE-256 helper used to derive X-Wing/ML-KEM seed
material. The original mandatory `libcrux-sha3` 0.0.8 dependency is affected by
RUSTSEC-2026-0207 and RUSTSEC-2026-0208 and also pulls `libcrux-secrets` 0.0.5,
affected by RUSTSEC-2026-0212. The patched file uses the maintained RustCrypto
`sha3` implementation and removes the unused optional libcrux HPKE backend.

Keep this patch until DAVE/OpenMLS adopts hpke-rs 0.7 or a later compatible
release without the vulnerable dependency chain. Changes in this directory
remain licensed under MPL-2.0.
