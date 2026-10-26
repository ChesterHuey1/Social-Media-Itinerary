from pinpoint.enrich.extract import PatternExtractor


def facts(text: str) -> dict[str, dict]:
    return {f.field: f.value for f in PatternExtractor().extract(text)}


def test_reads_hours_in_english_and_japanese() -> None:
    assert facts("Opening hours: 9:00 - 22:00")["hours"] == {"openMin": 540, "closeMin": 1320}
    assert facts("営業時間 10:00～18:30")["hours"] == {"openMin": 600, "closeMin": 1110}
    assert facts("Open 9:30 am to 5:00 pm daily")["hours"] == {"openMin": 570, "closeMin": 1020}


def test_hours_past_midnight_run_into_the_next_day() -> None:
    assert facts("Business hours 17:00-2:00")["hours"] == {"openMin": 1020, "closeMin": 1560}


def test_open_24_hours() -> None:
    assert facts("We are open 24 hours")["hours"] == {"always": True}


def test_ignores_a_time_range_with_no_hours_wording() -> None:
    assert "hours" not in facts("Event 9:00-10:00 on Saturday")


def test_reads_last_entry_price_and_booking() -> None:
    found = facts("Last admission 21:00\nAdult ticket ¥3,800\nAdvance tickets recommended")
    assert found["last_entry"] == {"atMin": 1260}
    assert found["cost"] == {"jpy": 3800}
    assert found["booking"] == {"needed": True}
    assert facts("入場料 大人 500円")["cost"] == {"jpy": 500}
    assert facts("ご来店は要予約です")["booking"] == {"needed": True}
    assert facts("Book tickets online, it sells out on weekends")["booking"] == {"needed": True}


def test_keeps_the_line_each_fact_came_from() -> None:
    (fact,) = PatternExtractor().extract("Menu\nOpening hours: 9:00 - 22:00\nAccess")
    assert fact.evidence == "Opening hours: 9:00 - 22:00"
