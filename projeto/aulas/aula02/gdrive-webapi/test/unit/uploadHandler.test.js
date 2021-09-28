import {
  describe,
  test,
  expect,
  beforeEach,
  jest
} from '@jest/globals'
import fs from 'fs'
import { resolve } from 'path'
import { pipeline } from 'stream/promises'
import { logger } from '../../src/logger'
import UploadHandler from '../../src/uploadHandler'
import TestUtil from '../_util/testUtil'

describe('#uploadHandler test suite', () => {
  const ioObj = {
    to: (id) => ioObj,
    emit: (event, message) => { }
  }

  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation()
  })

  describe('#registerEvents', () => {
    test('should call onFile and onFinish fnctions on Busboy instance', () => {
      const uploadHandler = new UploadHandler({
        io: ioObj,
        socketId: '01'
      }) 

      jest.spyOn(uploadHandler, uploadHandler.onFile.name).mockResolvedValue()

      // multipart/form-data ===>> assinatura de envio de dados
      // boundary ===> é para dizer dentro do form-data aonde o arquivo estar, os metadados do arquivo etc
      const headers = {
        'content-type': 'multipart/form-data; boundary='
      }
      const onFinish = jest.fn()
      const busboyInstance = uploadHandler.registerEvents(headers, onFinish)

      const filestream = TestUtil.generateReadableStreams(['chunk', 'of', 'data'])
      busboyInstance.emit('file', 'fieldname', filestream, 'filename.txt')

      // Pegou todo mundo que estava escutando o onFinish e colocou para executar
      busboyInstance.listeners('finish')[0].call()

      expect(uploadHandler.onFile).toHaveBeenCalled() 
      expect(onFinish).toHaveBeenCalled()
    })

  })

  describe('#onFile', () => {
    test('given a stream file it should save it on disk', async () => {
      const chunks = ['hey', 'dude'] // Nossos dados
      const downloadsFolder = '/tmp'
      const handler = new UploadHandler({
        io: ioObj,
        socketId: '01',
        downloadsFolder
      })
      
      const onData = jest.fn()
      // Cada vez que chegar um chunk novo ele chamara o nosso onData e passara para a função de WritableStreams
      jest.spyOn(fs, fs.createWriteStream.name).mockImplementation(() => TestUtil.generateWritableStreams(onData))

      const onTransform = jest.fn()
      jest.spyOn(handler, handler.handlerFileBytes.name).mockImplementation(() => TestUtil.generateTransformStreams(onTransform))

      const params = {
        fieldname: 'video',
        file: TestUtil.generateReadableStreams(chunks),
        filename: 'mockFile.mov',
      }
      await handler.onFile(...Object.values(params))

      // Eu espero que todas as chamadas que tiveram no onData sejam exatamento o resultado final do chunks
      expect(onData.mock.calls.join()).toEqual(chunks.join())
      expect(onTransform.mock.calls.join()).toEqual(chunks.join())

      // Usando o resolve para fazer a concatenação de forma mais bonita rs
      const expectedFileName = resolve(handler.downloadsFolder, params.filename)
      // Verificar se quando ele esteve la estava com o caminho certo
      expect(fs.createWriteStream).toHaveBeenCalledWith(expectedFileName)
    })
  })

  describe('#handlerFileBytes', () => {
    test('should call emit function and it is a tansfrom stream', async () => {
      jest.spyOn(ioObj, ioObj.to.name)
      jest.spyOn(ioObj, ioObj.emit.name)

      const handler = new UploadHandler({
        io: ioObj,
        socketId: '01'
      })

      jest.spyOn(handler, handler.canExecute.name).mockReturnValue(true)

      const messages = ['hello']
      // Nossa fonte de dados
      const source = TestUtil.generateReadableStreams(messages)
      const onWrite = jest.fn()
      // A ultima etapa do processo
      const target = TestUtil.generateWritableStreams(onWrite)

      await pipeline (
        source,
        handler.handlerFileBytes('filename.txt'),
        target
      )

      // Assinatura do metodo io
      // ioObj.to('1').emit('evento', 'message')

      expect(ioObj.to).toHaveBeenCalledTimes(messages.length)
      expect(ioObj.emit).toHaveBeenCalledTimes(messages.length)

      // Se o handleFileBytes for um transform stream, nosso pipeline
      // vai continuar o processo, passando os dados para frente
      // e chamar nossa função no target a cada chunk
      expect(onWrite).toBeCalledTimes(messages.length)

      // validação se ele esta sendo chamado com os parametros corretos
      expect(onWrite.mock.calls.join()).toEqual(messages.join())
    })

    test.only('given message timerdelay as 2secs it should emit only two messages during 3 seconds period', async () => {
      jest.spyOn(ioObj, ioObj.emit.name)

      const day = '2021-07-01 01:01'
      // Date.now do this.lastMessageSent em handleBytes
  
      const onFirstLastMessageSent = TestUtil.getTimeFromDate(`${day}:00`)

      // -> primeiro hello chegou
      const onFirstCanExecute = TestUtil.getTimeFromDate(`${day}:02`)
      const onSecondUpdateLastMessageSent = onFirstCanExecute

      // -> segundo hello, está fora da janela de tempo
      const onSecondCanExecute = TestUtil.getTimeFromDate(`${day}:03`)

      // -> word
      const onThirdCanExecute = TestUtil.getTimeFromDate(`${day}:04`)

      TestUtil.mockDateNow(
        [
          onFirstLastMessageSent,
          onFirstCanExecute,
          onSecondCanExecute,
          onThirdCanExecute,
          onSecondUpdateLastMessageSent
        ]
      ) 

      const messageTimeDelay = 2000
      const handler = new UploadHandler({
        io: ioObj,
        socketId: '01',
        messageTimeDelay
      })

      const messages = ['hello', 'hello', 'world']
      const filename = 'filename.avi'
      const expectedMessagensSent = 2

      const source = TestUtil.generateReadableStreams(messages)

      await pipeline(source, handler.handlerFileBytes(filename))

      expect(ioObj.emit).toHaveBeenCalledTimes(expectedMessagensSent)

      const [firstCallResult, secondCallResult] = ioObj.emit.mock.calls

      expect(firstCallResult).toEqual([handler.ON_UPLOAD_EVENT, { processedAlready: 'hello'.length, filename }])
      expect(secondCallResult).toEqual([handler.ON_UPLOAD_EVENT, { processedAlready: messages.length, filename }])

    })
  })

  describe('#canExecute', () => {
    test.skip('should return true time is later specified delay', () => {
      const timerDelay = 1000

      const uploadHandler = new UploadHandler({
        io: {},
        socketId: '',
        messageTimeDelay: timerDelay
      })

      const now = TestUtil.getTimeFromDate('2021-07-01 00:00:03')
      TestUtil.mockDateNow([now])
      const lastExecution = TestUtil.getTimeFromDate('2021-07-01 00:00:00')

      const result = uploadHandler.canExecute(lastExecution);
      expect(result).toBeTruthy()
    })

    test('should return false time isnt later than specified delay', () => {
      const timerDelay = 3000

      const uploadHandler = new UploadHandler({
        io: {},
        socketId: '',
        messageTimeDelay: timerDelay
      })

      const now = TestUtil.getTimeFromDate('2021-07-01 00:00:02')
      TestUtil.mockDateNow([now])
      const lastExecution = TestUtil.getTimeFromDate('2021-07-01 00:00:01')

      const result = uploadHandler.canExecute(lastExecution);
      expect(result).toBeFalsy()
    })
  })
}) 