# Phase 6: QR Code Support - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Mobile-friendly code exchange for P2P connection. Users can display QR codes for connection offers and scan QR codes to initiate connection, as an alternative to copy-pasting long text codes.

</domain>

<decisions>
## Implementation Decisions

### QR Display
- QR code is primary, text code is secondary
- Medium size (180-200px) for balance between scanability and dialog space
- Standard black/white styling for maximum scan compatibility
- Icon button next to QR reveals/copies text code as fallback

### Scanning UX
- Cutout overlay style — dark overlay with transparent scanning area in center
- Auto-connect on valid scan (no confirmation prompt)
- Silent scanning — no haptic or visual feedback until successful connection
- Scanner stays active until success or user cancels

### Error Handling
- Camera denied: show text paste fallback (no permission instructions)
- Invalid QR: inline message in viewfinder ("Invalid code, try again")
- Proactively check for camera before showing scan option — hide if unavailable

### Claude's Discretion
- Scanner access method (button in existing dialog vs separate mode)
- Scan timeout behavior
- Mobile dialog adaptation (full-screen sheet vs centered modal)
- Full-screen vs contained camera on mobile
- Role-specific UI optimization (creator vs joiner)
- Responsive breakpoints

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-qr-code-support*
*Context gathered: 2026-01-23*
