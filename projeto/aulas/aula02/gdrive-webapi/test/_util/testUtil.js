import { jest } from '@jest/globals'
import { Readable, Writable, Transform } from 'stream'

export default class TestUtil {

  static mockDateNow(mockImplementationPeriods) {
    const now = jest.spyOn(global.Date, global.Date.now.name)

    mockImplementationPeriods.forEach(time => {
      now.mockReturnValueOnce(time);
    })
  }

  static getTimeFromDate(dateString) {
    return new Date(dateString).getTime()
  }

  static generateReadableStreams(data) {
    // read => executa algum dado e quem estiver escutando recebera um onData
    return new Readable({
      objectMode: true,
      read() {
        for (const item of data) {
          this.push(item)
        }
        this.push(null)
      }
    })
  }

  static generateWritableStreams(onData) {
    return new Writable({
      objectMode: true,
      // chunk -> pedaço do arquivo
      // cd -> callback para ser chamada no final
      write(chunk, encondig, cb) {
        onData(chunk)
        cb(null, chunk)
      }
    })
  }

  static generateTransformStreams(onData) {
    return new Transform({
      objectMode: true,
      transform(chunk, encondig, cb){
        onData(chunk)
        cb(null, chunk)
      }
    })
  }
}