# Deep Dive 02 — Quantum Technologies (2026–2036)
*Wave-1 research agent output, full version. Method: 8 WebSearch angles; WebFetch broadly blocked (403); load-bearing figures confirmed across ≥2 independent sources; vendor roadmap dates and lunar-He-3/market-size projections flagged lower-confidence.*

## Bottom line
Quantum's binding scarcities are NOT the qubits — they're the enabling layers that scale slower than qubit counts and have physics/capital ceilings. In rough order of how early/hard they bind: **(1) Helium-3 + sub-Kelvin cryogenics, (2) cryo-CMOS control electronics / I/O "wiring bottleneck," (3) real-time QEC decoding (classical compute), (4) QEC/quantum talent.** Specialty materials (enriched Si-28) and photonics (SNSPDs, InP lasers — shared with AI optics) are second-order but investable. Biggest risk: commercial quantum stays marginal through ~2030 (lab demos run ~5–8 yrs ahead of commercial value); pure-plays down 28–33% YTD 2026 on ~$31M revenues / multi-billion valuations.

## 1. 10-Year roadmap (lab demo vs commercial value)
**Near-certain:** 2025 baseline ~1,000–1,200 physical qubits (Atom Computing Phoenix 1,180; QuEra 448-atom → 96 logical qubits via [[16,6,4]] codes, Jan 2026 *Nature*); 2-qubit fidelities ~99.7–99.9%; below-threshold error correction demonstrated (real, recent). Real-time decoding demonstrated sub-µs on FPGA (Riverlane); Deltaflow 3 targeted late 2026. 2026–2027 "scientific quantum advantage" (narrow, often un-commercial); first FT modules (IBM ~2027).

**Vendor self-reported (treat as targets):** IBM "Starling" 2029 (~200 logical qubits, 100M gates; → 2,000 logical/1B gates ~2033 via qLDPC); Google FT logical qubits "before 2030"; Quantinuum "Apollo" 2030 (universal FT); IonQ 2M physical qubits by 2030 (aggressive); PsiQuantum million-qubit photonic, ops ~2027–2028.

**Honest commercial read:** useful FT for real problems (chemistry, materials, some optimization) most credibly **2028–2032**; broad commercial value **early-to-mid 2030s**. Reality check: Quantinuum 2025 rev ~$31M vs ~$10B valuation; Rigetti CEO "~3 years"; Jensen Huang "15–30 yrs, ~20 realistic." Networking: QKD range-capped (~100 km), partly obsoleted by post-quantum crypto (software); repeaters pre-commercial through the decade. Sensing: earliest real value but small market (~$7–10B by 2035).

## 2. Value-chain map
Cryogenics (dilution fridges; **He-3** working fluid; pulse-tube): Bluefors ~34%, Oxford Instruments ~21–25%, Leiden, Janis. Control/I/O (cryo-CMOS, coax, AWGs, DACs): Intel/imec/QuTech, Quantum Machines, Zurich Instruments, Keysight, SEEQC. Photonics (SNSPDs, single-photon sources, InP lasers, modulators): PsiQuantum/GlobalFoundries, Single Quantum, ID Quantique, Lumentum/Coherent. Materials (enriched **Si-28**, ultra-pure substrates, **C-12**, **Yb-176/171**): ASP Isotopes, Isoflex, Urenco. Software/QEC (real-time decoders, compilers): Riverlane, Q-CTRL, Nvidia (CUDA-Q). Talent: cross-cutting.

## 3. Structural scarcities

### #1 Helium-3 + sub-Kelvin cryogenics
- **Why:** Superconducting/silicon-spin qubits need <10 mK via dilution fridges whose working fluid is He-3, which comes from **tritium decay** at a physics-fixed rate (cannot accelerate). Global supply ~8,000–15,000 L STP/yr; price ~$1,900–2,600/L; each large fridge consumes meaningful liters; scaling multiplies fridge count.
- **Timing:** Binds ~2026–2028, tightest 2028–2032. Eases only if lunar/terrestrial He-3 (Interlune 2028+, unproven), He-3-free coolers (DARPA), or non-mK modalities win. Realistic easing early-to-mid 2030s, conditional.
- **Moat:** Very high — fridge oligopoly, 6–12mo lead, $1–5M/unit, deep know-how; He-3 physics-limited.
- **Investable:** **Oxford Instruments (LSE: OXIG)** cleanest public; Bluefors (private). Interlune (private, pre-revenue; 10,000 L/yr claim ~rivals all current Earth production — treat skeptically).

### #2 Cryo-CMOS control electronics & the I/O "wiring bottleneck"
- **Why:** Each qubit needs multiple coax lines to room-temp electronics — does NOT scale past a few thousand qubits (wires consume fridge space, dump heat at mK where cooling power is ~hundreds of µW). Million-qubit machines impossible without moving control into the cold (cryo-CMOS). The hardest *engineering* wall.
- **Timing:** Binds ~2027–2030 as systems push past ~10k qubits; structural through mid-2030s.
- **Moat:** High — custom silicon validated at mK, ultra-low-power, foundry access.
- **Investable:** Intel (Horse Ridge lineage), SEEQC (private), Quantum Machines (private), Zurich/Keysight (KEYS). **Largely private/pre-IPO — a gap to front-run.**

### #3 Real-time QEC decoding (classical compute at the cryo edge)
- **Why:** FT requires decoding syndromes within the µs QEC cycle, continuously, across thousands→millions of logical qubits. NP-hard in general; CPUs miss the deadline → dedicated FPGA/ASIC; at scale decoders must be shared (contention). Nov-2025 industry report: fast hardware decoders + talent the "biggest bottlenecks."
- **Timing:** Binds in lockstep with logical-qubit scaling ~2028–2033. **MOST LIKELY TO DISSOLVE via algorithmic progress (qLDPC predecoding, GPU accel) — a trap for moat investors.**
- **Investable:** Riverlane (private pure-play, raised ~$75M), Q-CTRL (private), Nvidia (NVDA, CUDA-Q), FPGA vendors AMD (Xilinx)/Intel (Altera).

### #4 QEC / quantum-systems talent
- **Why:** ~30,000 workers today vs ~250,000 roles by 2030 / ~840,000 by 2035; ~1 candidate per 3 roles. Acute gap is QEC + quantum-classical/cryo-RF engineers — exactly what #2/#3 demand.
- **Moat:** Very durable (human-capital lead times).
- **Investable:** Hard to invest directly; favors incumbents that hoard talent (IBM, Google, Quantinuum); CHIPS federal equity stakes concentrate talent.

### #5 Specialty isotopes & ultra-pure materials
- **Why:** Silicon-spin needs enriched **Si-28** (natural Si-29 spin destroys coherence; ~1000× coherence gain). Ion/atom need Yb-176/171; NV-diamond needs C-12. Enrichment thin/concentrated.
- **Timing:** Binds if silicon-spin scales (~2028+); modality-contingent.
- **Investable:** **ASP Isotopes (NASDAQ: ASPI)** clean public pure-play (Si-28 commercial since Mar 2025); Isoflex, Urenco.

### #6 Photonic components (SNSPDs, sources, low-loss optics, lasers)
- **Why:** Photonic QC + networking need near-unity SNSPDs, deterministic single-photon sources, low-loss waveguides, quantum memories (repeaters). Optical loss is THE gating problem. Crucially, **laser supply overlaps with AI data-center optics** (InP EML/CW lasers) — Nvidia's ~$4B Lumentum/Coherent lock-up (Mar 2026) stretched lead times past 2027; quantum competes for the same InP epitaxy.
- **Timing:** Binds now–2029 for lasers (AI-driven); 2028–2035 for repeater-grade components (may not arrive, capping networking).
- **Investable:** Lumentum (LITE), Coherent (COHR) (InP, but AI-dominated), Single Quantum / ID Quantique (private), PsiQuantum (private), GlobalFoundries (GFS) (quantum foundry, $375M CHIPS).

## 4. Non-consensus
Under-priced: (1) cryo-CMOS/I/O wiring is the most underappreciated hard wall (largely private → no ticker → mispriced); (2) quantum photonics demand hostage to AI's optics shortage (shared InP supply chain); (3) decoding is a classical-compute scarcity hiding inside a "quantum" story — and the most likely to be SOLVED (a trap). Over-hyped: lunar He-3; pure-play quantum equities (full modality/timeline risk, ~$30M rev / multi-B valuations); QKD (range-capped, partly obsoleted by post-quantum crypto). **Position picks-and-shovels (Oxford Instruments, ASP Isotopes, GlobalFoundries, Keysight, diversified Nvidia), not qubit makers.**

## 5. Confidence
High: He-3/cryogenics physics-limited; cryo-CMOS/wiring binds 2027–2030; decoding a near-term bottleneck (but dissolvable); talent gap durable. Medium: useful commercial FT 2028–2032. Low: vendor logical-qubit dates; lunar He-3 by 2028; McKinsey $2.7T-by-2035. **The honest tail risk: quantum stays commercially marginal through ~2030 — if demand disappoints, scarcity timing slides 2–4 yrs and the safest exposures are diversified picks-and-shovels that also serve AI/research markets.**

## 6. Sources
ibm.com/quantum/blog/large-scale-ftqc · quantinuum.com (FT by 2030) · thequantuminsider.com/2025/05/16 (roadmaps) · warontherocks.com/2025/10 (supply-chain chokepoints) · entangledfuture.com (supply chain) · science.org (He-3 scarce) · magnapetra.com (He-3 scaling) · postquantum.com (cryo infra; decoder bottleneck; silicon-spin; neutral-atom) · datacenterdynamics.com (DARPA He-3-free) · prnewswire.com + thequantuminsider.com/2025/09/17 (Interlune–Bluefors) · intelmarketresearch.com + businessresearchinsights.com (dilution-fridge market) · bluefors.com/news (cryo-CMOS) · arxiv.org/html/2601.03922 (cryoelectronics) · nature.com/articles/s41586-021-03469-4 (cryo-CMOS spin) · riverlane.com/news (real-time decoder) · arxiv.org/abs/2410.05202 + arxiv.org/abs/2605.03180 (QEC/qLDPC) · thequantuminsider.com/2025/11/19 (error correction + talent) · technical.ly (talent gap) · briandcolwell.com (ultra-pure Si) · thequantuminsider.com/2025/03/27 + globenewswire 2026/04/13 (ASP Si-28) · psiquantum.com + thequantuminsider.com/2025/09/10 ($1B raise) · trendforce.com 20251208 + sdxcentral.com (AI laser/InP/Nvidia) · quantumzeitgeist.com (networking; neutral-atom) · mckinsey.com (Quantum Tech Monitor 2026) · prnewswire.com (hype-to-proof) · thequantuminsider.com/2025/10/20 (public quantum stocks).
