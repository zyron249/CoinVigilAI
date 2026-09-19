from app.services.news import parse_feed_bytes


SAMPLE_RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fixture Feed</title>
    <item>
      <title>Bitcoin holds range</title>
      <link>https://example.test/bitcoin</link>
      <pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate>
      <description>A fixture summary.</description>
    </item>
  </channel>
</rss>
"""


def test_parse_feed_bytes_extracts_items():
    items = parse_feed_bytes(SAMPLE_RSS, "fallback", 10)
    assert len(items) == 1
    assert items[0]["title"] == "Bitcoin holds range"
    assert items[0]["link"] == "https://example.test/bitcoin"
    assert items[0]["source"] == "Fixture Feed"
    assert items[0]["summary"].startswith("A fixture summary")
