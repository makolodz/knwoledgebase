import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useCountdown } from './useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  function setup(initial: string | null) {
    const target = ref<string | null>(initial)
    let result!: ReturnType<typeof useCountdown>
    mount(
      defineComponent({
        setup() {
          result = useCountdown(target)
          return () => h('div')
        },
      }),
    )
    return { target, countdown: result }
  }

  it('décompte chaque seconde jusqu’à la fin, puis indique qu’elle est atteinte', async () => {
    const { countdown } = setup('2030-01-01T10:01:30Z')
    expect(countdown.text.value).toBe('00:01:30')
    expect(countdown.finished.value).toBe(false)

    await vi.advanceTimersByTimeAsync(31_000)
    expect(countdown.text.value).toBe('00:00:59')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(countdown.text.value).toBe('00:00:00')
    expect(countdown.finished.value).toBe(true)
  })

  it('se recalcule quand la date change (prolongation)', async () => {
    const { target, countdown } = setup('2030-01-01T10:00:10Z')
    await vi.advanceTimersByTimeAsync(5_000)

    target.value = '2030-01-01T10:02:05Z'
    await vi.advanceTimersByTimeAsync(1_000)

    expect(countdown.text.value).toBe('00:01:59')
    expect(countdown.finished.value).toBe(false)
  })

  it('ne se dit pas terminé sans date', () => {
    const { countdown } = setup(null)

    expect(countdown.finished.value).toBe(false)
  })
})
