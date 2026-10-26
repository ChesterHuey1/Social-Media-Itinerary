"""The scraper's rules, tested against a fake network: no real site is contacted."""

from pinpoint.enrich.scraper import MIN_DELAY_S, PoliteScraper, Response

PAGE = (
    "<html><head><title>Tsukiji</title><script>var x=1;</script></head><body>"
    + "<p>Open 5:00-14:00</p>" * 30
    + "</body></html>"
)


class FakeNet:
    def __init__(self, pages: dict[str, Response]) -> None:
        self.pages = pages
        self.requests: list[str] = []

    def fetch(self, url: str, agent: str) -> Response:
        self.requests.append(url)
        return self.pages.get(url, Response(404, "text/html", b""))


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def html(body: str, status: int = 200) -> Response:
    return Response(status, "text/html; charset=utf-8", body.encode())


def scraper(net: FakeNet, clock: FakeClock | None = None) -> PoliteScraper:
    clock = clock or FakeClock()
    return PoliteScraper("PinpointBot/test", fetch=net.fetch, clock=clock.clock, sleep=clock.sleep)


def test_stores_cleaned_text_without_scripts() -> None:
    net = FakeNet({"https://a.jp/": html(PAGE)})
    result = scraper(net).scrape("https://a.jp/")
    assert result.outcome == "stored"
    assert result.title == "Tsukiji"
    assert "var x" not in result.text
    assert "Open 5:00-14:00" in result.text


def test_skips_pages_robots_txt_disallows() -> None:
    net = FakeNet(
        {"https://a.jp/robots.txt": html("User-agent: *\nDisallow: /private/"), "https://a.jp/private/x": html(PAGE)}
    )
    result = scraper(net).scrape("https://a.jp/private/x")
    assert result.outcome == "robots_disallowed"
    assert "https://a.jp/private/x" not in net.requests


def test_missing_robots_txt_allows_and_unreachable_disallows() -> None:
    net = FakeNet({"https://a.jp/": html(PAGE), "https://b.jp/robots.txt": Response(None, "", b"")})
    assert scraper(net).scrape("https://a.jp/").outcome == "stored"
    assert scraper(net).scrape("https://b.jp/").outcome == "robots_disallowed"


def test_waits_two_seconds_between_requests_to_the_same_site() -> None:
    net = FakeNet({"https://a.jp/1": html(PAGE), "https://a.jp/2": html(PAGE)})
    clock = FakeClock()
    s = scraper(net, clock)
    s.scrape("https://a.jp/1")
    s.scrape("https://a.jp/2")
    # robots.txt, page 1 and page 2: each request after the first waits out the 2 seconds.
    assert clock.slept == [MIN_DELAY_S, MIN_DELAY_S]


def test_never_waits_for_a_different_site() -> None:
    net = FakeNet({"https://a.jp/": html(PAGE), "https://b.jp/": html(PAGE)})
    clock = FakeClock()
    s = scraper(net, clock)
    s.allowed("https://a.jp/")
    s.allowed("https://b.jp/")
    assert clock.slept == []


def test_stops_on_a_block_or_captcha_and_does_not_retry() -> None:
    net = FakeNet(
        {
            "https://a.jp/": html("", status=403),
            "https://b.jp/": html("<title>Just a moment...</title><p>Checking your browser</p>" * 20),
        }
    )
    assert scraper(net).scrape("https://a.jp/").outcome == "blocked"
    assert scraper(net).scrape("https://b.jp/").outcome == "blocked"
    assert net.requests.count("https://a.jp/") == 1


def test_a_page_built_by_javascript_is_not_stored() -> None:
    net = FakeNet({"https://a.jp/": html("<div id='root'></div><script>render()</script>")})
    assert scraper(net).scrape("https://a.jp/").outcome == "needs_javascript"


def test_never_scrapes_instagram_or_google_maps() -> None:
    net = FakeNet({})
    assert scraper(net).scrape("https://www.instagram.com/p/abc/").outcome == "robots_disallowed"
    assert scraper(net).scrape("https://www.google.com/maps/place/x").outcome == "robots_disallowed"
    assert net.requests == []


def test_follows_only_same_site_links_that_look_like_hours_or_prices() -> None:
    from bs4 import BeautifulSoup

    from pinpoint.enrich.scraper import useful_links

    soup = BeautifulSoup(
        "<a href='/access/'>Access</a><a href='/news/'>News</a><a href='/guide#fees'>料金</a>"
        "<a href='https://other.jp/hours'>Hours</a><a href='/access/'>Access again</a>",
        "html.parser",
    )
    assert useful_links(soup, "https://a.jp/") == ("https://a.jp/access/", "https://a.jp/guide")
