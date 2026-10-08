"""FIFO host questions with one future per asking activity."""
import asyncio
import json


def valid_text(value, limit, name):
    if type(value) is not str: raise TypeError(f'{name} needs text.')
    if len(value.encode('utf-16-le')) // 2 > limit: raise ValueError(f'{name} must fit within {limit} characters.')
    return value


class Questions:
    def __init__(self):
        self.pending = {}; self.serial = 0; self.answer = ''

    def _send(self, value):
        from _playground_host import question_emit
        question_emit(json.dumps(value))

    async def ask(self, text):
        from _playground_events import events
        if events.state != 'running': raise RuntimeError('Ask needs a running event handler or async function.')
        valid_text(text, 400, 'Question')
        if len(self.pending) >= 16: raise RuntimeError('Too many pending questions (limit 16). Ask fewer questions at once.')
        if self.serial >= 1000: raise RuntimeError('This run exceeded 1,000 questions. Stop and run again.')
        self.serial += 1; identity = self.serial
        future = asyncio.get_running_loop().create_future(); self.pending[identity] = future
        try:
            self._send({'type': 'ask', 'id': identity, 'text': text})
            return await future
        finally:
            if self.pending.pop(identity, None) is not None: self._send({'type': 'cancel', 'id': identity})

    def receive(self, identity, answer):
        if answer is not None: valid_text(answer, 2048, 'Answer')
        future = self.pending.pop(identity, None)
        if future is None or future.done(): return False
        if answer is not None: self.answer = answer
        future.set_result(answer)
        return True

    def cancel_all(self):
        if not self.pending: return
        self._send({'type': 'clear'})
        for identity in list(self.pending): self.receive(identity, None)


def receive_answer(identity, answer):
    from _playground_scene import inputs
    return inputs._questions is not None and inputs._questions.receive(identity, answer)
