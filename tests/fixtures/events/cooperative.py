from playground import events

count = 0


async def delayed_double(value):
    await events.wait(0.01)
    return value * 2


async def first(payload):
    global count
    count = count + 1
    print("first starts", count)
    await events.wait(0.3)
    print("first ends", count)


async def second(payload):
    global count
    count = count + 1
    print("second starts", count)
    print("double", await delayed_double(21))


events.on("start", first)
events.on("start", second)
