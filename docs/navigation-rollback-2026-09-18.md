# Explorer-style navigation release and rollback

Restore point: `37b0207f91ef7871a86fffe181eaf905da187170`.
Remote tag: `backup/before-explorer-navigation-20260918`.

This is the production version immediately before explorer-style navigation. It already includes the earlier Stock tab and mobile performance fixes. Unpublished multivendor changes are excluded.

To undo this navigation release, revert its commit on the latest production main branch, validate, and push the revert to main. Prefer a revert over a force-push so later unrelated changes and history are preserved. The backup tag identifies the full prior source snapshot. Do not reset the working store database; this release makes no database schema changes.

Release scope: retain current page during navigation, bounded catalog prefetch on intent and up to two visible links, 30-second prefetch freshness, no speculative private/payment routes, delayed subtle progress indicator, and removal of full-page loading boundaries added in the preceding release.
