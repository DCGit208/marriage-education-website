/**
 * SBD Life — first production editorial: The Crisis of Modern Attraction
 */
(function (global) {
  var ARTICLE_ID = 'crisis-of-modern-attraction';
  var ISSUE_ID = 'issue-attraction-formation-2026';

  function blocks() {
    return [
      {
        type: 'paragraph',
        text:
          'There has never been a generation more exposed to attraction — and less formed in it.'
      },
      {
        type: 'paragraph',
        text:
          'People know how to post, pose, perform, signal, seduce, and scroll. But very few know how to communicate deeply, create emotional safety, sustain attraction, embody masculinity or femininity, build intimacy, understand polarity, navigate desire intelligently, or maintain emotional presence inside relationships.'
      },
      {
        type: 'paragraph',
        text: 'Modern culture teaches visibility. It rarely teaches embodiment.'
      },
      {
        type: 'pull_quote',
        text: 'Desired online — but disconnected in real life.',
        attribution: 'SBD Life'
      },
      {
        type: 'heading',
        text: 'The illusion of constant attention'
      },
      {
        type: 'paragraph',
        text:
          'Social media created a dangerous confusion: attention became mistaken for value. A message notification feels like intimacy. A like feels like validation. A follow feels like desirability.'
      },
      {
        type: 'paragraph',
        text:
          'But attraction is not built through endless exposure. Real attraction is built through presence, energy, communication, discipline, emotional intelligence, mystery, self-control, depth, and psychological safety.'
      },
      {
        type: 'paragraph',
        text: 'Many people are now surrounded by stimulation — but starving for connection.'
      },
      {
        type: 'heading',
        text: 'Why relationships feel increasingly fragile'
      },
      {
        type: 'paragraph',
        text:
          'Modern relationships are collapsing under emotional immaturity disguised as freedom. People enter relationships without communication skills, emotional awareness, relational discipline, or understanding of masculinity, femininity, attraction, conflict, or intimacy — then expect chemistry alone to sustain commitment.'
      },
      {
        type: 'pull_quote',
        text: 'Attraction without formation eventually becomes instability.',
        attribution: 'SBD Life'
      },
      {
        type: 'paragraph',
        text: 'And desire without emotional intelligence eventually becomes chaos.'
      },
      {
        type: 'heading',
        text: 'The masculinity crisis'
      },
      {
        type: 'paragraph',
        text:
          'Many men today were taught how to chase success — but not how to lead emotionally. Some learned dominance without discipline. Others learned softness without strength.'
      },
      {
        type: 'paragraph',
        text:
          'Very few were taught presence, groundedness, communication, restraint, emotional control, or relational leadership. As a result, many relationships suffer from emotional passivity, confusion, avoidance, or hidden resentment.'
      },
      {
        type: 'pull_quote',
        text: 'True masculinity is not noise. It is grounded presence.',
        attribution: 'SBD Life'
      },
      {
        type: 'heading',
        text: 'The femininity crisis'
      },
      {
        type: 'paragraph',
        text:
          'Many women today are exhausted — not because femininity is weak, but because modern culture often forces women into emotional survival modes disconnected from softness, emotional safety, receptivity, elegance, or trust.'
      },
      {
        type: 'paragraph',
        text:
          'At the same time, many women were never taught how attraction actually works, how emotional polarity functions, how communication shapes intimacy, or how unresolved wounds distort relationships.'
      },
      {
        type: 'pull_quote',
        text: 'Femininity is not performance. It is embodied emotional intelligence.',
        attribution: 'SBD Life'
      },
      {
        type: 'heading',
        text: 'Attraction is more psychological than physical'
      },
      {
        type: 'paragraph',
        text:
          'Most people think attraction is mainly physical. It is not. Physical attraction may open the door — but emotional atmosphere determines whether intimacy survives.'
      },
      {
        type: 'paragraph',
        text:
          'The way someone speaks. The way someone listens. The way someone handles tension. The way someone carries themselves. The way someone responds emotionally. These shape attraction far more deeply than appearances alone.'
      },
      {
        type: 'paragraph',
        text:
          'People are often attracted to certainty, clarity, presence, warmth, restraint, confidence, emotional safety, and emotional depth.'
      },
      {
        type: 'heading',
        text: 'The cost of endless consumption'
      },
      {
        type: 'paragraph',
        text:
          'One of the greatest modern problems is this: people consume relationship content endlessly without transformation. They scroll through quotes, videos, podcasts, dating advice, relationship clips, and attraction discussions — but rarely enter actual formation.'
      },
      {
        type: 'paragraph',
        text:
          'Information without embodiment changes very little. Transformation requires practice, reflection, discipline, awareness, community, and intentional growth.'
      },
      {
        type: 'heading',
        text: 'What SBD Network was built to do'
      },
      {
        type: 'paragraph',
        text:
          'SBD Network was not built as another social platform. It was built as a formation ecosystem — a place for communication intelligence, attraction intelligence, masculinity and femininity development, emotional intelligence, marriage education, identity transformation, disciplined self-development, and psychologically intelligent relationships.'
      },
      {
        type: 'paragraph',
        text: 'Not passive scrolling. Formation.'
      },
      {
        type: 'paragraph',
        text:
          'Because modern people do not simply need more content. They need structure, clarity, guidance, community, and transformation.'
      },
      {
        type: 'heading',
        text: 'The future will belong to emotionally intelligent people'
      },
      {
        type: 'paragraph',
        text:
          'The people who will thrive relationally in the future are not merely the loudest, the richest, or the most visible. It will be those who understand people, presence, communication, discipline, identity, emotional intelligence, and attraction deeply.'
      },
      {
        type: 'paragraph',
        text: 'The future belongs to people who are formed.'
      },
      {
        type: 'pull_quote',
        text:
          'Many people learned how to be seen — before they ever learned how to become.',
        attribution: 'SBD Life'
      }
    ];
  }

  function articlePayload(authorId, now) {
    return {
      title: 'The Crisis of Modern Attraction',
      slug: ARTICLE_ID,
      excerpt:
        'Why so many people feel desired online — but empty in real life.',
      contentType: 'cultural_commentary',
      tierRequired: 'public',
      status: 'published',
      visibility: 'public',
      authorId: authorId,
      authorName: 'SBD Life Editorial',
      authorRole: 'editor',
      coverImage: '',
      estimatedReadTime: 14,
      contentBlocks: blocks(),
      issueId: ISSUE_ID,
      relatedMVHouseLooks: [],
      discussionEnabled: true,
      audioVersionAvailable: true,
      shareQuote:
        'Many people learned how to be seen — before they ever learned how to become.',
      publishedAt: now,
      updatedAt: now
    };
  }

  function issuePayload(now) {
    return {
      title: 'The Attraction Formation Issue',
      slug: ISSUE_ID,
      issueNumber: 1,
      theme: 'Attraction & Formation',
      description:
        'A founding editorial on visibility, embodiment, and the psychological architecture of modern attraction.',
      tierRequired: 'public',
      releaseDate: now,
      archived: false,
      editorLetter:
        'This issue opens SBD Life with a single conviction: attraction without formation produces visibility without intimacy. We invite you to read slowly, reflect structurally, and return to formation — not the feed.',
      featuredArticles: [ARTICLE_ID],
      issueColorTheme: '#b8924a',
      printEditionAvailable: false
    };
  }

  global.SbdLifeEditorialCrisis = {
    ARTICLE_ID: ARTICLE_ID,
    ISSUE_ID: ISSUE_ID,
    blocks: blocks,
    articlePayload: articlePayload,
    issuePayload: issuePayload
  };
})(window);
