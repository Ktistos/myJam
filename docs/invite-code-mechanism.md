# Invite Code Mechanism

Private jams are joined through short invite codes. Invite codes are not used for public jams.

## Code Generation

- Private jam creation generates a unique 6-character uppercase alphanumeric code.
- Public jams have `invite_code = null`.
- Codes are generated server-side in `backend/app/api/routers/jams.py`.
- The database enforces uniqueness with the unique `jams.invite_code` column.
- If a generated code collides, the backend retries before returning `503`.

## Code Visibility

- Only jam admins receive `invite_code` in `JamOut`.
- Non-admin participants and guests receive `invite_code = null`.
- Private jam admins can reveal/copy the code from the jam detail page.

## Joining With A Code

1. The user enters a code from the Jam List screen.
2. The frontend normalizes the code to uppercase alphanumeric characters.
3. The frontend calls `GET /jams/invite/{code}`.
4. If the code is valid, the backend returns the matching jam.
5. The frontend opens the normal join flow for that jam.
6. On confirmation, the frontend calls `POST /jams/{jam_id}/join?invite_code={code}`.
7. The backend revalidates the invite code before adding the participant.

The lookup step is only discovery. The join endpoint is the enforcement point.

## Regenerating Codes

- Only admins can regenerate invite codes.
- Regeneration is only allowed for private jams.
- `POST /jams/{jam_id}/invite-code` creates a new unique code.
- The old code immediately stops working because it is replaced in the jam row.
- Existing participants are unaffected.

## Backend Rules

- `GET /jams/invite/{code}` returns `404` for invalid or stale codes.
- `POST /jams/{jam_id}/join` returns `403` for private jams without a valid code.
- `POST /jams/{jam_id}/join` returns `409` if the user is already a participant.
- Code normalization strips non-alphanumeric characters and uppercases the result, so `abc-123` and `ABC123` are equivalent.

## Frontend Rules

- Guests do not see the invite-code entry control.
- Authenticated users can enter invite codes from the Jam List.
- Admins of private jams can show, copy, and regenerate the code from Jam Detail.
- Regeneration prompts for confirmation because existing invite links/codes become invalid.

## Security Notes

- Invite codes are bearer secrets. Anyone with a valid code can discover and request to join the private jam.
- Invite codes are short for usability, not cryptographic secrecy. If stronger protection is needed later, increase `INVITE_CODE_LENGTH` or use a separate long invite token.
- The backend never trusts the frontend lookup alone; it validates the code again on join.
