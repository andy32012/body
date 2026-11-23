"""Phonemes written by hand for the clips where the automatic ones are not what the lesson teaches
(the synthesiser's own symbols: A = eɪ, I = aɪ, O = oʊ, W = aʊ, Y = ɔɪ, ɾ = the quick American t between vowels)."""
OVERRIDE = {
    # "can" in a sentence is weak [kən]; "can't" keeps its full vowel.
    'I can swim.': 'ˌI kən swˈɪm.',
    'She can walk.': 'ʃˌi kən wˈɔk.',
    'He can come.': 'hˌi kən kˈʌm.',
    'We can go.': 'wˌi kən ɡˈO.',
    # Linking: the t between two vowels is the quick American one, and the words run together.
    'turn it off': 'tˈɜɹn ɪɾ ˈɔf.',
    'check it out': 'ʧˈɛk ɪɾ ˈWt.',
    'pick it up': 'pˈɪk ɪɾ ˈʌp.',
    'not at all': 'nˌɑɾ əɾ ˈɔl.',
    'a lot of water': 'ɐ lˈɑɾ əv wˈɔɾəɹ.',
    'sit up': 'sˈɪɾ ˈʌp.',
    'What is it?': 'wˈʌɾ ɪz ɪt?',
    'Can you turn it off?': 'kən ju tˈɜɹn ɪɾ ˈɔf?',
    'Drink a lot of water.': 'dɹˈɪŋk ɐ lˈɑɾ əv wˈɔɾəɹ.',
    'I will check it out in an hour.': 'ˌI wɪl ʧˈɛk ɪɾ ˈWt ɪn ɐn ˈWəɹ.',
}
