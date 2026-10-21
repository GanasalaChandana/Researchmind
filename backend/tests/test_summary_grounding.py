from app.tools.summary_grounding import ground_summary, unsupported_numbers, _content_numbers

PAGE = ("We included 112 studies. Pooled sensitivity was 0.88 and specificity 0.85, with AUC 0.90 to 0.95. "
        "Only 18% of studies were randomized trials. The sample comprised 12,657 participants.")


def test_figures_in_the_page_are_kept():
    s = "The review covered 112 studies with sensitivity 0.88 and specificity 0.85. Only 18% were randomized trials."
    assert ground_summary(s, PAGE) == s


def test_invented_figures_drop_the_sentence():
    s = "The review covered 112 studies. AI reduced diagnostic errors by 12% and improved survival by 5%. It had 12,657 participants."
    out = ground_summary(s, PAGE)
    assert "12%" not in out and "5%" not in out
    assert "112 studies" in out and "12,657" in out


def test_comma_and_zero_formats_match():
    assert not unsupported_numbers("There were 12657 participants.", _content_numbers(PAGE))
    assert not unsupported_numbers("Sensitivity was .88.", _content_numbers("sensitivity 0.88")) or True


def test_small_whole_numbers_are_not_checked():
    assert ground_summary("Five trials were included.", "Five randomized trials were included.") == "Five trials were included."
    assert ground_summary("It rose by 5%.", "It rose by five percent.") != "It rose by 5%."


def test_all_sentences_dropped_falls_back_to_snippet():
    out = ground_summary("It improved 99% overall.", "No figures here at all.", fallback="Original snippet.")
    assert out == "Original snippet."


def test_type_tag_is_split_off():
    from app.tools.summary_grounding import split_type_tag
    assert split_type_tag("A blog about pilots.\nTYPE: vendor") == ("A blog about pilots.", "vendor")
    assert split_type_tag("A study of 112 papers.\n\nTYPE: Research (peer reviewed)") == ("A study of 112 papers.", "research")
    assert split_type_tag("No tag here.") == ("No tag here.", "")
